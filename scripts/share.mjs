#!/usr/bin/env node
// Post a published article's "share" section to Facebook, Instagram or Google Business Profile,
// through the Make scenario "MPS · Social share".
//
//   MPS_SOCIAL_HOOK=<webhook url> MPS_SOCIAL_TOKEN=<token> node scripts/share.mjs <slug> <facebook|instagram|google|all>
//
// The webhook URL and token are secrets: they live in the blog routine's prompt, never in this repo.
// share.status: "pending" (waiting for Gab) -> "approved" (Gab said yes; this script refuses anything
// else) -> "posted" (all three done). Each platform is posted once: one already recorded under
// share.posted is skipped, so a failed platform can be retried on its own.
// The share images must be live on the blog first (Instagram downloads them), so this waits up to
// 10 minutes for them after a publish. The result is written back into post.json; commit it afterwards.

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://blog.mobilepitstop.uk';
const PLATFORMS = ['facebook', 'instagram', 'google'];

const [slug, which] = process.argv.slice(2);
const hook = process.env.MPS_SOCIAL_HOOK;
const token = process.env.MPS_SOCIAL_TOKEN;
if (!slug || !which || !(which === 'all' || PLATFORMS.includes(which))) {
  console.error('Usage: node scripts/share.mjs <slug> <facebook|instagram|google|all>');
  process.exit(1);
}
if (!hook || !token) {
  console.error('MPS_SOCIAL_HOOK and MPS_SOCIAL_TOKEN must be set (they are in the blog routine prompt).');
  process.exit(1);
}

const file = path.join(ROOT, 'content', 'posts', slug, 'post.json');
const raw = await readFile(file, 'utf8');
const meta = JSON.parse(raw);
const share = meta.share;
if (meta.status !== 'published') fail(`"${slug}" isn't published yet, so there's nothing to share.`);
if (!share) fail(`"${slug}" has no share section.`);
if (share.status === 'skipped') fail(`Sharing "${slug}" was skipped on purpose (share.status is "skipped").`);
if (share.status === 'pending') fail(`Gab hasn't approved the social posts for "${slug}" yet (share.status is "pending").`);

const link = `${SITE}/${slug}/`;
const images = (share.images || []).map((im) => `${link}${im.src}`);
await waitForImages(images);

share.posted = share.posted || {};
let failed = false;
for (const platform of which === 'all' ? PLATFORMS : [which]) {
  if (share.posted[platform]) {
    console.log(`${platform}: already posted ${share.posted[platform].at}, skipping`);
    continue;
  }
  const body = {
    token,
    platform,
    slug,
    title: meta.title,
    link,
    facebook: share.facebook,
    instagram: share.instagram,
    google: share.google,
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
    share.posted[platform] = { at: new Date().toISOString().replace(/\.\d+Z$/, 'Z'), id: out.id || '', ...(out.url ? { url: out.url } : {}) };
    console.log(`${platform}: posted (${out.id || 'no id returned'})`);
  } else {
    failed = true;
    const why = out?.error || text.slice(0, 300) || `HTTP ${res.status}`;
    console.log(`${platform}: FAILED (HTTP ${res.status}): ${why}`);
    if (text.trim() === 'Accepted') console.log('  "Accepted" means no route ran: the token is wrong or the scenario is off.');
  }
}

if (PLATFORMS.every((p) => share.posted[p])) share.status = 'posted';
const nl = raw.includes('\r\n') ? '\r\n' : '\n';
await writeFile(file, (JSON.stringify(meta, null, 2) + '\n').replace(/\n/g, nl));
process.exit(failed ? 1 : 0);

async function waitForImages(urls) {
  const deadline = Date.now() + 10 * 60_000;
  for (const url of urls) {
    for (;;) {
      const r = await fetch(url, { method: 'HEAD' }).catch(() => null);
      if (r?.ok && /image\/jpeg/.test(r.headers.get('content-type') || '')) break;
      if (Date.now() > deadline) fail(`${url} still isn't live after 10 minutes. Has the "Publish blog" workflow finished?`);
      await new Promise((ok) => setTimeout(ok, 20_000));
    }
  }
}

function fail(msg) {
  console.error(msg);
  process.exit(1);
}
