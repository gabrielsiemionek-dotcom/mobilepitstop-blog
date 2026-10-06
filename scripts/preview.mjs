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
