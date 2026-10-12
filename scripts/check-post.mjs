#!/usr/bin/env node
// Checks a post (or every post) against the rules in WRITING.md.
//   node scripts/check-post.mjs content/posts/<slug>
//   node scripts/check-post.mjs --all
// Errors fail the check (and the publish workflow). Warnings are for a human look.

import { readFile, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const POSTS = path.join(ROOT, 'content', 'posts');
const facts = JSON.parse(await readFile(path.join(ROOT, 'content', 'facts.json'), 'utf8'));

const allowedLinks = new Set(
  [...facts.services.map((s) => s.url), ...Object.values(facts.other_pages).filter((u) => u.startsWith('https://'))].map(normUrl)
);
const allowedPrices = new Set(Object.values(facts.prices || {}).flat().map(String));

const BANNED = [
  'delve', 'elevate', 'unleash', 'game-changer', 'game changer', 'look no further', "in today's fast-paced", 'whether you’re', "whether you're",
  "it's important to note", 'it is important to note', 'ever-evolving', 'testament to', 'seamless', 'nestled', 'embark', 'showroom-ready',
  'transform your ride', 'guaranteed', 'guarantee', '100%', 'permanently', 'removes all scratches', 'kills 99', 'kills all',
];
const ALLOWED_TAGS = new Set(['p', 'h2', 'h3', 'ul', 'ol', 'li', 'strong', 'em', 'a', 'figure', 'img', 'figcaption', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'blockquote', 'br']);

const arg = process.argv[2];
let dirs = [];
if (arg === '--all') {
  if (existsSync(POSTS)) {
    for (const e of await readdir(POSTS, { withFileTypes: true })) if (e.isDirectory()) dirs.push(path.join(POSTS, e.name));
  }
} else if (arg) {
  dirs = [path.resolve(arg)];
} else {
  console.error('Usage: node scripts/check-post.mjs <post folder> | --all');
  process.exit(1);
}

const existingSlugs = existsSync(POSTS) ? (await readdir(POSTS, { withFileTypes: true })).filter((e) => e.isDirectory()).map((e) => e.name) : [];
let failed = false;
for (const dir of dirs) {
  const { errors, warnings } = await check(dir);
  const name = path.relative(ROOT, dir);
  if (!errors.length && !warnings.length) console.log(`✓ ${name}`);
  for (const e of errors) console.log(`✗ ${name}: ${e}`);
  for (const w of warnings) console.log(`! ${name}: ${w}`);
  if (errors.length) failed = true;
}
if (!dirs.length) console.log('No posts yet.');
process.exit(failed ? 1 : 0);

async function check(dir) {
  const errors = [];
  const warnings = [];
  const slug = path.basename(dir);
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) errors.push(`folder name "${slug}" must be lowercase words separated by dashes`);

  let meta;
  try {
    meta = JSON.parse(await readFile(path.join(dir, 'post.json'), 'utf8'));
  } catch (e) {
    return { errors: [`post.json missing or invalid: ${e.message}`], warnings };
  }
  const body = existsSync(path.join(dir, 'body.html')) ? await readFile(path.join(dir, 'body.html'), 'utf8') : '';
  if (!body.trim()) errors.push('body.html is missing or empty');

  // post.json
  if (!meta.title) errors.push('title is missing');
  else if (meta.title.length > 70) warnings.push(`title is ${meta.title.length} characters (aim for 60 or fewer)`);
  if (!['draft', 'published'].includes(meta.status)) errors.push('status must be "draft" or "published"');
  if (!meta.publishedAt || Number.isNaN(Date.parse(meta.publishedAt))) errors.push('publishedAt must be a date like 2026-10-08T07:00:00Z');
  const md = meta.meta_description || '';
  if (md.length < 110 || md.length > 165) warnings.push(`meta_description is ${md.length} characters (aim for 130-160)`);
  if (!meta.excerpt) warnings.push('excerpt is missing');
  if (!meta.hero?.src) errors.push('hero.src is missing');
  else if (!/^https?:/.test(meta.hero.src) && !existsSync(path.join(dir, meta.hero.src))) errors.push(`hero image ${meta.hero.src} not found in the post folder`);
  if (!meta.hero?.alt) errors.push('hero.alt is missing');
  const faq = Array.isArray(meta.faq) ? meta.faq : [];
  if (faq.length < 3 || faq.length > 6) warnings.push(`${faq.length} FAQs (aim for 3-5)`);
  for (const f of faq) if (!f.q || !f.a) errors.push('every FAQ needs q and a');
  if (meta.cta) {
    if (!meta.cta.buttonUrl || !allowedLinks.has(normUrl(meta.cta.buttonUrl))) errors.push(`cta.buttonUrl must be a service URL from facts.json (got ${meta.cta.buttonUrl})`);
  } else warnings.push('no cta set, so the default "Book a valet" box will show');

  // body.html: tags
  if (/<h1\b/i.test(body)) errors.push('body.html must not contain <h1> (the page adds the title)');
  if (/<script\b|\son[a-z]+\s*=|style\s*=/i.test(body)) errors.push('body.html must not contain scripts, event handlers or inline styles');
  for (const m of body.matchAll(/<\s*([a-z0-9]+)\b/gi)) {
    if (!ALLOWED_TAGS.has(m[1].toLowerCase())) errors.push(`tag <${m[1]}> isn't allowed`);
  }
  const h2s = (body.match(/<h2\b/gi) || []).length;
  if (h2s < 3) warnings.push(`only ${h2s} <h2> sections (aim for 4-7)`);

  // words
  const text = body.replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ').trim();
  const words = text.split(' ').filter(Boolean).length;
  if (words < 700) warnings.push(`${words} words (aim for 900-1,500)`);
  if (words > 2200) warnings.push(`${words} words (aim for 900-1,500)`);

  // banned phrases and prices
  const all = `${meta.title} ${meta.meta_description} ${meta.excerpt} ${faq.map((f) => `${f.q} ${f.a}`).join(' ')} ${text}`.toLowerCase();
  for (const b of BANNED) if (all.includes(b)) errors.push(`uses the banned phrase "${b}"`);
  for (const m of all.matchAll(/£\s?(\d[\d,.]*)/g)) {
    if (!allowedPrices.has(m[1].replace(/,/g, ''))) errors.push(`mentions a price (£${m[1]}) that isn't confirmed in facts.json`);
  }
  const bangs = (text.match(/!/g) || []).length;
  if (bangs > 1) warnings.push(`${bangs} exclamation marks (keep it to one at most)`);

  // links
  let serviceLinks = 0;
  for (const m of body.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>/gi)) {
    const href = m[1];
    if (href.startsWith('https://mobilepitstop.uk')) {
      if (!allowedLinks.has(normUrl(href)) && !/\/mobile-valeting-service-[a-z-]+$/.test(href)) errors.push(`link ${href} isn't in facts.json`);
      else serviceLinks++;
    } else if (href.startsWith('/')) {
      const target = href.replace(/^\/|\/$/g, '');
      if (!existingSlugs.includes(target)) errors.push(`link ${href} doesn't match an existing post`);
    } else if (/^https?:/.test(href)) {
      if (!/rel="[^"]*noopener/.test(m[0])) warnings.push(`external link ${href} should have rel="noopener"`);
      warnings.push(`external link to ${new URL(href).hostname}, check it's an official source`);
    } else if (!href.startsWith('#') && !href.startsWith('tel:') && !href.startsWith('mailto:')) {
      errors.push(`unexpected link ${href}`);
    }
  }
  if (serviceLinks < 2) warnings.push(`${serviceLinks} links to MobilePitStop pages (aim for 2-4)`);

  // share: the social posts (Facebook, Instagram, Google Business Profile) sent when the post is published
  if (meta.share) {
    const sh = meta.share;
    if (!['pending', 'posted', 'skipped'].includes(sh.status)) errors.push('share.status must be "pending", "posted" or "skipped"');
    const imgs = Array.isArray(sh.images) ? sh.images : [];
    if (imgs.length < 2 || imgs.length > 10) errors.push(`share.images needs 2-10 images (an Instagram carousel needs at least 2; has ${imgs.length})`);
    for (const im of imgs) {
      if (!im.src || !/\.jpe?g$/i.test(im.src)) errors.push(`share image ${im.src} must be a .jpg (Instagram only accepts JPEG)`);
      else if (!existsSync(path.join(dir, im.src))) errors.push(`share image ${im.src} not found in the post folder`);
      if (!im.alt || im.alt.length < 8) errors.push(`share image ${im.src} needs descriptive alt text`);
    }
    for (const k of ['facebook', 'instagram', 'google']) if (!sh[k] || !String(sh[k]).trim()) errors.push(`share.${k} caption is missing`);
    const ig = String(sh.instagram || '');
    if (ig.length > 2200) errors.push(`share.instagram is ${ig.length} characters (Instagram's limit is 2,200)`);
    if ((ig.match(/#[\p{L}\d_]+/gu) || []).length > 10) warnings.push('share.instagram has more than 10 hashtags (aim for 3-8)');
    if (/https?:\/\//.test(ig)) warnings.push('share.instagram contains a link; Instagram captions don\'t make links clickable');
    if (/https?:\/\//.test(String(sh.facebook || ''))) warnings.push('share.facebook contains a link; the article link is added at the end automatically');
    const gb = String(sh.google || '');
    if (gb.length > 1500) errors.push(`share.google is ${gb.length} characters (Google's limit is 1,500)`);
    const capt = `${sh.facebook || ''} ${ig} ${gb}`.toLowerCase();
    for (const b of BANNED) if (capt.includes(b)) errors.push(`a share caption uses the banned phrase "${b}"`);
    for (const m of capt.matchAll(/£\s?(\d[\d,.]*)/g)) {
      if (!allowedPrices.has(m[1].replace(/,/g, ''))) errors.push(`a share caption mentions a price (£${m[1]}) that isn't confirmed in facts.json`);
    }
  } else if (meta.status === 'draft') warnings.push('no share section, so nothing will be posted to Facebook, Instagram or Google');

  // images
  for (const m of body.matchAll(/<img\b[^>]*>/gi)) {
    const tag = m[0];
    const src = (tag.match(/src="([^"]+)"/) || [])[1];
    const alt = (tag.match(/alt="([^"]*)"/) || [])[1];
    if (!src) errors.push('an <img> has no src');
    else if (!/^https?:/.test(src) && !existsSync(path.join(dir, src))) errors.push(`image ${src} not found in the post folder`);
    if (!alt || alt.length < 8) errors.push(`image ${src} needs descriptive alt text`);
    if (!/width="\d+"/.test(tag) || !/height="\d+"/.test(tag)) warnings.push(`image ${src} should have width and height`);
  }
  for (const f of await readdir(dir)) {
    if (/\.(webp|png|jpe?g)$/i.test(f)) {
      const s = (await stat(path.join(dir, f))).size;
      // share-N.jpg are only fetched by Facebook / Instagram / Google, never shown on the page
      if (/^share-\d+\.jpe?g$/i.test(f)) {
        if (s > 1024 * 1024) warnings.push(`${f} is ${Math.round(s / 1024)} KB (keep share images under 1 MB)`);
      } else if (s > 300 * 1024) warnings.push(`${f} is ${Math.round(s / 1024)} KB (keep images under 250 KB)`);
      if (!/\.webp$/i.test(f) && !/^share-\d+\.jpe?g$/i.test(f)) warnings.push(`${f} isn't WebP`);
    }
  }
  return { errors: [...new Set(errors)], warnings: [...new Set(warnings)] };
}

function normUrl(u) {
  return String(u).replace(/\/+$/, '').replace(/^http:/, 'https:').toLowerCase();
}
