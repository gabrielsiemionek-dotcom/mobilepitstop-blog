#!/usr/bin/env node
// Tells IndexNow search engines (Bing, Yandex, Seznam, Naver and others) about new or updated posts
// straight after a publish. Google doesn't use IndexNow; it finds posts through the sitemap.
//
//   node scripts/indexnow.mjs --previous <articles.json from before this publish> [--dry-run]
//
// Compares the freshly built dist/articles.json with the live one saved before the build, and sends only
// the posts that are new or changed. Never fails the publish: problems are printed as warnings.

import { readFile, appendFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import config from '../site.config.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = config.siteUrl.replace(/\/+$/, '');
const KEY = config.indexNowKey;
const ENDPOINT = process.env.INDEXNOW_ENDPOINT || 'https://api.indexnow.org/indexnow';

const args = process.argv.slice(2);
const prevFile = args.includes('--previous') ? args[args.indexOf('--previous') + 1] : null;
const dryRun = args.includes('--dry-run');
const waitTries = Number(process.env.INDEXNOW_WAIT_TRIES || 12);
const waitMs = Number(process.env.INDEXNOW_WAIT_MS || 15000);

main().catch((err) => warn(`IndexNow skipped: ${err.message}`));

async function main() {
  if (!KEY) return warn('No indexNowKey in site.config.mjs, so nothing was sent.');
  const now = await readList(path.join(ROOT, 'dist', 'articles.json'));
  if (!now) return warn('dist/articles.json not found. Run the build first.');
  const before = (prevFile && (await readList(prevFile))) || [];

  const seen = new Map(before.map((a) => [a.url, a.updated || a.published || '']));
  const changed = now.filter((a) => !seen.has(a.url) || seen.get(a.url) !== (a.updated || a.published || '')).map((a) => a.url);
  if (!changed.length) return log('No new or updated posts, so nothing to send.');

  const urlList = [...new Set([...changed, `${SITE}/`])].slice(0, 10000);
  log(`Posts to announce (${changed.length}):\n  ${changed.join('\n  ')}`);
  if (dryRun) return log('Dry run: not sending.');

  // The key file must be live before engines will accept the notice.
  const keyUrl = `${SITE}/${KEY}.txt`;
  if (!(await waitForKeyFile(keyUrl))) {
    return warn(`${keyUrl} isn't reachable yet (is the custom domain set up?). Nothing sent this time.`);
  }

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ host: new URL(SITE).host, key: KEY, keyLocation: keyUrl, urlList }),
    signal: AbortSignal.timeout(30000),
  });
  if (res.status === 200 || res.status === 202) {
    log(`IndexNow accepted ${urlList.length} URL(s) (HTTP ${res.status}).`);
    await summary(`### IndexNow\n\nAnnounced ${changed.length} new or updated post(s) to Bing and other IndexNow engines.\n`);
  } else {
    const body = (await res.text().catch(() => '')).slice(0, 200);
    warn(`IndexNow answered HTTP ${res.status}${body ? `: ${body}` : ''}`);
  }
}

async function waitForKeyFile(url) {
  for (let i = 0; i < waitTries; i++) {
    try {
      const r = await fetch(`${url}?t=${Date.now()}`, { signal: AbortSignal.timeout(10000) });
      if (r.ok && (await r.text()).trim() === KEY) return true;
    } catch {}
    if (i < waitTries - 1) await new Promise((r) => setTimeout(r, waitMs));
  }
  return false;
}

async function readList(file) {
  try {
    if (!existsSync(file)) return null;
    const data = JSON.parse(await readFile(file, 'utf8'));
    return Array.isArray(data) ? data : null;
  } catch {
    return null;
  }
}

function log(msg) {
  console.log(msg);
}

function warn(msg) {
  console.log(`::warning::${msg}`);
}

async function summary(text) {
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, text);
}
