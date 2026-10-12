#!/usr/bin/env node
// Post a published article's "share" section to Facebook, Instagram and Google Business Profile,
// through the Make scenario "MPS · Social share".
//
//   node scripts/share.mjs --approved                                   every approved, not yet posted share
//   node scripts/share.mjs <slug> <facebook|instagram|google|all>       one article
//
// It needs MPS_SOCIAL_HOOK (the webhook URL) and MPS_SOCIAL_TOKEN. They are secrets: they're stored as
// GitHub Actions secrets on this repo and passed in by the "Publish blog" workflow, which runs this with
// --approved after every deploy. Never put them in this repo, a prompt or a log.
//
// share.status: "pending" (waiting for Gab) -> "approved" (Gab said yes; this script refuses anything
// else) -> "posted" (all three done). Each platform is posted once: one already recorded under
// share.posted is skipped, so a failed platform is retried on its own the next time this runs.
// The share images must be live on the blog first (Instagram downloads them), so this waits up to
// 10 minutes for them. Results are written back into post.json; the workflow commits them.

import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const POSTS = path.join(ROOT, 'content', 'posts');
const SITE = 'https://blog.mobilepitstop.uk';
const PLATFORMS = ['facebook', 'instagram', 'google'];

const [arg, which] = process.argv.slice(2);
const hook = process.env.MPS_SOCIAL_HOOK;
const token = process.env.MPS_SOCIAL_TOKEN;
if (!(arg === '--approved' || (arg && (which === 'all' || PLATFORMS.includes(which))))) {
  console.error('Usage: node scripts/share.mjs --approved   or   node scripts/share.mjs <slug> <facebook|instagram|google|all>');
  process.exit(1);
}
if (!hook || !token) {
  console.error('MPS_SOCIAL_HOOK and MPS_SOCIAL_TOKEN must be set (GitHub Actions secrets on this repo).');
  process.exit(1);
}

let failed = false;
if (arg === '--approved') {
  const slugs = [];
  for (const e of await readdir(POSTS, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    const meta = JSON.parse(await readFile(path.join(POSTS, e.name, 'post.json'), 'utf8'));
    if (meta.status === 'published' && meta.share?.status === 'approved') slugs.push([meta.publishedAt, e.name]);
  }
  if (!slugs.length) console.log('No approved social posts waiting.');
  for (const [, slug] of slugs.sort()) await share(slug, 'all');
} else {
  await share(arg, which);
}
process.exit(failed ? 1 : 0);

async function share(slug, which) {
  console.log(`== ${slug}`);
  const file = path.join(POSTS, slug, 'post.json');
  const raw = await readFile(file, 'utf8');
  const meta = JSON.parse(raw);
  const sh = meta.share;
  if (meta.status !== 'published') return skip(`isn't published yet, so there's nothing to share`);
  if (!sh) return skip('has no share section');
  if (sh.status === 'skipped') return skip('was skipped on purpose (share.status is "skipped")');
  if (sh.status === 'pending') return skip(`isn't approved by Gab yet (share.status is "pending")`);

  const link = `${SITE}/${slug}/`;
  const images = (sh.images || []).map((im) => `${link}${im.src}`);
  if (!(await waitForImages(images))) return;

  sh.posted = sh.posted || {};
  for (const platform of which === 'all' ? PLATFORMS : [which]) {
    if (sh.posted[platform]) {
      console.log(`${platform}: already posted ${sh.posted[platform].at}, skipping`);
      continue;
    }
    const body = {
      token,
      platform,
      slug,
      title: meta.title,
      link,
      facebook: sh.facebook,
      instagram: sh.instagram,
      google: sh.google,
      fb_photos: images.map((url) => ({ type: 'url', url })),
      ig_files: images.map((image_url) => ({ media_type: 'IMAGE', image_url })),
      gbp_media: images.slice(0, 1).map((sourceUrl) => ({ mediaFormat: 'PHOTO', sourceUrl })),
    };
    let res, text;
    try {
      res = await fetch(hook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(170_000),
      });
      text = await res.text();
    } catch (e) {
      console.log(`${platform}: FAILED, no answer from Make (${e.message}). Check the scenario's history before retrying, in case it posted anyway.`);
      failed = true;
      continue;
    }
    let out = null;
    try {
      out = JSON.parse(text);
    } catch {}
    if (res.ok && out?.ok) {
      sh.posted[platform] = { at: new Date().toISOString().replace(/\.\d+Z$/, 'Z'), id: out.id || '', ...(out.url ? { url: out.url } : {}) };
      console.log(`${platform}: posted (${out.id || 'no id returned'})`);
    } else {
      failed = true;
      console.log(`${platform}: FAILED (HTTP ${res.status}): ${out?.error || text.slice(0, 300) || 'no details'}`);
      if (text.trim() === 'Accepted') console.log('  "Accepted" means no route ran: the token is wrong or the scenario is off.');
    }
  }

  if (PLATFORMS.every((p) => sh.posted[p])) sh.status = 'posted';
  const nl = raw.includes('\r\n') ? '\r\n' : '\n';
  await writeFile(file, (JSON.stringify(meta, null, 2) + '\n').replace(/\n/g, nl));

  function skip(why) {
    console.log(`"${slug}" ${why}.`);
    if (arg !== '--approved') failed = true;
  }
}

async function waitForImages(urls) {
  const deadline = Date.now() + 10 * 60_000;
  for (const url of urls) {
    for (;;) {
      const r = await fetch(url, { method: 'HEAD' }).catch(() => null);
      if (r?.ok && /image\/jpeg/.test(r.headers.get('content-type') || '')) break;
      if (Date.now() > deadline) {
        console.log(`${url} still isn't live after 10 minutes, so nothing was posted for it. It'll be tried again next time.`);
        failed = true;
        return false;
      }
      await new Promise((ok) => setTimeout(ok, 20_000));
    }
  }
  return true;
}
