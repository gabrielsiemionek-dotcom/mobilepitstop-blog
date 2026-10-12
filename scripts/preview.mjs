#!/usr/bin/env node
// Make a single self-contained HTML preview of a post (draft or not), for sending to Gab for approval.
//   node scripts/preview.mjs <slug> [out.html]
// Builds the site with drafts into dist-preview/, then inlines the CSS and images into one file.

import { execFileSync } from 'node:child_process';
import { readFile, writeFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const slug = process.argv[2];
if (!slug) {
  console.error('Usage: node scripts/preview.mjs <slug> [out.html]');
  process.exit(1);
}
const outFile = path.resolve(process.argv[3] || path.join(ROOT, 'preview', `${slug}.html`));

// Build into dist/ with drafts included, then read the post page.
execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'build.mjs')], {
  cwd: ROOT,
  env: { ...process.env, INCLUDE_DRAFTS: '1' },
  stdio: 'inherit',
});
const dist = path.join(ROOT, 'dist');
const pagePath = path.join(dist, slug, 'index.html');
if (!existsSync(pagePath)) throw new Error(`No built page for "${slug}". Is the folder name right?`);
let html = await readFile(pagePath, 'utf8');

// Show the social posts (sent to Facebook, Instagram and Google when the post is published) under the post.
const meta = JSON.parse(await readFile(path.join(ROOT, 'content', 'posts', slug, 'post.json'), 'utf8'));
if (meta.share) {
  const esc = (t) => String(t || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const box = 'max-width:760px;margin:40px auto;padding:20px;border:2px dashed #999;border-radius:12px;font-family:system-ui,sans-serif';
  const imgs = (meta.share.images || [])
    .map((im) => `<img src="${esc(im.src)}" alt="${esc(im.alt)}" style="width:180px;height:auto;border-radius:8px;margin:0 8px 8px 0">`)
    .join('');
  const cap = (label, t) => `<h3 style="margin:18px 0 6px">${label}</h3><p style="white-space:pre-wrap;margin:0">${esc(t)}</p>`;
  const panel = `<section style="${box}"><h2 style="margin-top:0">Social posts (sent when you reply "publish")</h2>
<p style="margin:0 0 10px">Status: ${esc(meta.share.status)}. The Facebook and Google posts link to the article.</p>${imgs}
${cap('Facebook', meta.share.facebook)}${cap('Instagram', meta.share.instagram)}${cap('Google Business Profile', meta.share.google)}</section>`;
  html = html.replace('</body>', `${panel}</body>`);
}

const css = await readFile(path.join(dist, 'assets', 'blog.css'), 'utf8');
html = html.replace(/<link rel="stylesheet" href="[^"]+">/, `<style>${css}</style>`);

const mime = { webp: 'image/webp', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', svg: 'image/svg+xml' };
html = await replaceAsync(html, /(<img\b[^>]*\bsrc=")([^"]+)(")/g, async (m, a, src, b) => {
  if (/^(https?:|data:)/.test(src)) return m;
  const file = src.startsWith('/') ? path.join(dist, src.split('?')[0]) : path.join(dist, slug, src);
  if (!existsSync(file)) return m;
  const ext = path.extname(file).slice(1).toLowerCase();
  const data = (await readFile(file)).toString('base64');
  return `${a}data:${mime[ext] || 'application/octet-stream'};base64,${data}${b}`;
});
// Links inside the preview can't work offline; keep them visible but inert.
html = html.replace(/<link rel="icon"[^>]*>/, '');
await (await import('node:fs/promises')).mkdir(path.dirname(outFile), { recursive: true });
await writeFile(outFile, html);
await rm(dist, { recursive: true, force: true });
console.log(`Preview: ${outFile} (${Math.round(html.length / 1024)} KB)`);

async function replaceAsync(str, re, fn) {
  const parts = [];
  let last = 0;
  for (const m of str.matchAll(re)) {
    parts.push(str.slice(last, m.index), await fn(...m));
    last = m.index + m[0].length;
  }
  parts.push(str.slice(last));
  return parts.join('');
}
