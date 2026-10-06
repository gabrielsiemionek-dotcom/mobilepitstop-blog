#!/usr/bin/env node
// Branded graphics for blog posts, rendered to WebP in the MobilePitStop look.
//
// Usage:
//   node scripts/graphic.mjs spec.json                (spec has "out", or is an array of specs)
//   node scripts/graphic.mjs '{"template":"title",...}' out.webp
//
// Templates
//   title      { eyebrow, title, subtitle?, photo? }                   cover image (1600x900)
//   steps      { heading, steps: ["...", ...] (2-6), photo? }          numbered steps
//   table      { heading, columns: [...], rows: [[...]], highlight? }  comparison table
//   checklist  { heading, items: ["...", ...] (2-7), photo? }          ticked list
//   photo      { photo, caption?, label? }                             a job photo with a brand strip
//   pair       { left, right, leftLabel?, rightLabel?, position? }     before/after side by side (labels optional,
//                                                                     leave them out if the photos already have them)
// Common: width (default 1600), height (default 900), out (file path)

import { readFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { loadChromium, loadSharp } from './lib/tools.mjs';

const YELLOW = '#E3FC02';
const BLUE = '#00B8FF';

const [arg1, arg2] = process.argv.slice(2);
if (!arg1) {
  console.error('Usage: node scripts/graphic.mjs <spec.json | JSON> [out.webp]');
  process.exit(1);
}
let specs = existsSync(arg1) ? JSON.parse(await readFile(arg1, 'utf8')) : JSON.parse(arg1);
specs = Array.isArray(specs) ? specs : [specs];
if (arg2 && specs.length === 1) specs[0].out = arg2;

const sharp = await loadSharp();
const chromium = await loadChromium();
const browser = await chromium.launch();
try {
  for (const spec of specs) {
    if (!spec.out) throw new Error('Each spec needs an "out" path.');
    const width = spec.width || 1600;
    const height = spec.height || 900;
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
    await page.setContent(await render(spec, width, height), { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    const png = await page.screenshot({ type: 'png' });
    await page.close();
    await mkdir(path.dirname(path.resolve(spec.out)), { recursive: true });
    const info = await sharp(png).webp({ quality: spec.quality || (spec.template === 'pair' || spec.photo ? 76 : 84) }).toFile(spec.out);
    console.log(`${spec.out}  ${info.width}x${info.height}  ${Math.round(info.size / 1024)} KB`);
  }
} finally {
  await browser.close();
}

// ---------------------------------------------------------------------------

async function photoUri(file, width) {
  if (!file) return '';
  const buf = await sharp(file).rotate().resize({ width: Math.round(width * 1.1), withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer();
  return `data:image/jpeg;base64,${buf.toString('base64')}`;
}

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function titleSize(t, base) {
  const n = String(t).length;
  return n <= 28 ? base : n <= 45 ? base * 0.85 : n <= 65 ? base * 0.72 : base * 0.62;
}

async function render(spec, W, H) {
  const photo = await photoUri(spec.photo, W);
  const brand = `<div class="brand"><span class="mark">MOBILE<b>PITSTOP</b></span><span class="sub">Valeting &amp; Detailing · Cheshire · Merseyside · Flintshire</span></div>`;
  const base = `
  *{box-sizing:border-box;margin:0;padding:0}
  html,body{width:${W}px;height:${H}px;background:#000;color:#fff;font-family:Inter,system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;-webkit-font-smoothing:antialiased;overflow:hidden}
  .frame{position:relative;width:100%;height:100%;padding:72px 84px;display:flex;flex-direction:column}
  .bar{position:absolute;left:0;top:0;bottom:0;width:14px;background:${YELLOW}}
  .eyebrow{display:inline-block;align-self:flex-start;background:${YELLOW};color:#000;font-weight:900;font-size:26px;letter-spacing:.08em;text-transform:uppercase;padding:10px 18px;border-radius:999px;margin-bottom:30px}
  h1{font-weight:900;letter-spacing:-.035em;line-height:1.02}
  h2{font-weight:900;letter-spacing:-.03em;line-height:1.06;font-size:64px;margin-bottom:40px;max-width:24ch}
  .subtitle{color:rgba(255,255,255,.78);font-size:34px;line-height:1.35;margin-top:26px;max-width:34ch;font-weight:500}
  .brand{margin-top:auto;display:flex;align-items:baseline;gap:22px}
  .mark{font-weight:900;font-size:30px;letter-spacing:.04em;color:#fff}
  .mark b{color:${YELLOW};font-weight:900}
  .sub{color:rgba(255,255,255,.6);font-size:22px;font-weight:600}
  .bg{position:absolute;inset:0;background-size:cover;background-position:center}
  .shade{position:absolute;inset:0}
  .content{position:relative;z-index:1;display:flex;flex-direction:column;height:100%}
  `;

  if (spec.template === 'title') {
    const size = titleSize(spec.title, 112);
    return page(`${base}
      .shade{background:linear-gradient(90deg,rgba(0,0,0,.94) 0%,rgba(0,0,0,.82) 45%,rgba(0,0,0,.25) 100%)}
      h1{font-size:${size}px;max-width:${photo ? '15ch' : '19ch'}}
      .deco{position:absolute;right:-180px;top:50%;width:820px;height:820px;transform:translateY(-50%);border-radius:50%;
        background:radial-gradient(circle,rgba(227,252,2,.16) 0%,rgba(227,252,2,.05) 45%,transparent 70%)}
      .deco::after{content:"";position:absolute;inset:170px;border-radius:50%;border:3px solid rgba(227,252,2,.22)}
    `, `${photo ? `<div class="bg" style="background-image:url('${photo}')"></div><div class="shade"></div>` : '<div class="deco"></div>'}
      <div class="frame"><div class="bar"></div><div class="content">
        ${spec.eyebrow ? `<span class="eyebrow">${esc(spec.eyebrow)}</span>` : ''}
        <h1>${esc(spec.title)}</h1>
        ${spec.subtitle ? `<p class="subtitle">${esc(spec.subtitle)}</p>` : ''}
        ${brand}
      </div></div>`);
  }

  if (spec.template === 'steps') {
    const steps = (spec.steps || []).slice(0, 6);
    const cols = photo ? Math.min(2, steps.length) : steps.length <= 4 ? steps.length : 3;
    return page(`${base}
      .layout{display:flex;gap:56px;flex:1;min-height:0}
      .grid{flex:1;display:grid;grid-template-columns:repeat(${cols},1fr);gap:26px;align-content:start}
      .step{background:#111;border:2px solid rgba(255,255,255,.12);border-radius:22px;padding:28px 28px 30px}
      .n{display:inline-grid;place-items:center;width:62px;height:62px;border-radius:50%;background:${YELLOW};color:#000;font-weight:900;font-size:32px;margin-bottom:18px}
      .step p{font-size:${steps.length > 4 ? 27 : 30}px;line-height:1.3;font-weight:700}
      .ph{width:520px;border-radius:22px;background-size:cover;background-position:center;border:2px solid rgba(255,255,255,.12)}
    `, `<div class="frame"><div class="bar"></div><div class="content">
        <h2>${esc(spec.heading)}</h2>
        <div class="layout">
          <div class="grid">${steps.map((s, i) => `<div class="step"><span class="n">${i + 1}</span><p>${esc(s)}</p></div>`).join('')}</div>
          ${photo ? `<div class="ph" style="background-image:url('${photo}')"></div>` : ''}
        </div>
        ${brand}
      </div></div>`);
  }

  if (spec.template === 'table') {
    const cols = spec.columns || [];
    const rows = spec.rows || [];
    const hi = Number.isInteger(spec.highlight) ? spec.highlight : -1;
    const fs = rows.length > 5 ? 26 : 30;
    return page(`${base}
      table{width:100%;border-collapse:separate;border-spacing:0;font-size:${fs}px}
      th,td{padding:${rows.length > 5 ? 16 : 22}px 26px;text-align:left;border-bottom:2px solid rgba(255,255,255,.1)}
      th{font-size:${fs - 2}px;text-transform:uppercase;letter-spacing:.06em;color:rgba(255,255,255,.6);font-weight:900}
      td:first-child{color:rgba(255,255,255,.75);font-weight:700}
      td{font-weight:800}
      .hi{background:rgba(227,252,2,.1);color:${YELLOW}}
      th.hi{color:${YELLOW}}
      tr:last-child td{border-bottom:0}
      .wrap{border:2px solid rgba(255,255,255,.12);border-radius:22px;overflow:hidden;background:#0d0d0d}
    `, `<div class="frame"><div class="bar"></div><div class="content">
        <h2>${esc(spec.heading)}</h2>
        <div class="wrap"><table>
          <tr>${cols.map((c, i) => `<th class="${i === hi ? 'hi' : ''}">${esc(c)}</th>`).join('')}</tr>
          ${rows.map((r) => `<tr>${r.map((c, i) => `<td class="${i === hi ? 'hi' : ''}">${esc(c)}</td>`).join('')}</tr>`).join('')}
        </table></div>
        ${spec.note ? `<p class="subtitle" style="font-size:24px;margin-top:22px;max-width:60ch">${esc(spec.note)}</p>` : ''}
        ${brand}
      </div></div>`);
  }

  if (spec.template === 'checklist') {
    const items = (spec.items || []).slice(0, 7);
    return page(`${base}
      .layout{display:flex;gap:56px;flex:1;min-height:0}
      ul{list-style:none;flex:1;display:grid;gap:${items.length > 5 ? 16 : 22}px;align-content:start}
      li{display:flex;gap:22px;align-items:flex-start;font-size:${items.length > 5 ? 31 : 35}px;line-height:1.28;font-weight:700}
      .tick{flex:0 0 46px;height:46px;border-radius:50%;background:${YELLOW};display:grid;place-items:center;margin-top:-2px}
      .tick svg{width:26px;height:26px;stroke:#000;stroke-width:4;fill:none;stroke-linecap:round;stroke-linejoin:round}
      .ph{width:560px;border-radius:22px;background-size:cover;background-position:center;border:2px solid rgba(255,255,255,.12)}
    `, `<div class="frame"><div class="bar"></div><div class="content">
        <h2>${esc(spec.heading)}</h2>
        <div class="layout">
          <ul>${items.map((t) => `<li><span class="tick"><svg viewBox="0 0 24 24"><path d="M5 12.5l4.2 4.2L19 7"/></svg></span><span>${esc(t)}</span></li>`).join('')}</ul>
          ${photo ? `<div class="ph" style="background-image:url('${photo}')"></div>` : ''}
        </div>
        ${brand}
      </div></div>`);
  }

  if (spec.template === 'photo') {
    if (!photo) throw new Error('The photo template needs "photo".');
    return page(`${base}
      .shade{background:linear-gradient(0deg,rgba(0,0,0,.88) 0%,rgba(0,0,0,.2) 38%,rgba(0,0,0,0) 60%)}
      .frame{justify-content:flex-end}
      .label{display:inline-block;align-self:flex-start;background:${spec.labelColour === 'blue' ? BLUE : YELLOW};color:#000;font-weight:900;font-size:28px;letter-spacing:.08em;text-transform:uppercase;padding:10px 18px;border-radius:999px;margin-bottom:18px}
      .cap{font-size:40px;font-weight:800;line-height:1.2;max-width:30ch;margin-bottom:26px}
      .brand{margin-top:0}
    `, `<div class="bg" style="background-image:url('${photo}')"></div><div class="shade"></div>
      <div class="frame"><div class="content" style="justify-content:flex-end">
        ${spec.label ? `<span class="label">${esc(spec.label)}</span>` : ''}
        ${spec.caption ? `<p class="cap">${esc(spec.caption)}</p>` : ''}
        ${brand}
      </div></div>`);
  }

  if (spec.template === 'pair') {
    const left = await photoUri(spec.left, W / 2);
    const right = await photoUri(spec.right, W / 2);
    const tag = (t, c) => (t ? `<span class="tag" style="background:${c}">${esc(t)}</span>` : '');
    return page(`${base}
      .pair{position:absolute;inset:0;display:grid;grid-template-columns:1fr 1fr;gap:8px;background:#000}
      .half{position:relative;background-size:cover;background-position:${spec.position || 'center'}}
      .tag{position:absolute;left:28px;bottom:28px;color:#000;font-weight:900;font-size:30px;letter-spacing:.08em;text-transform:uppercase;padding:10px 20px;border-radius:999px}
    `, `<div class="pair">
        <div class="half" style="background-image:url('${left}')">${tag(spec.leftLabel, '#ffffff')}</div>
        <div class="half" style="background-image:url('${right}')">${tag(spec.rightLabel, YELLOW)}</div>
      </div>`);
  }

  throw new Error(`Unknown template "${spec.template}". Use title, steps, table, checklist, photo or pair.`);
}

function page(css, body) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body>${body}</body></html>`;
}
