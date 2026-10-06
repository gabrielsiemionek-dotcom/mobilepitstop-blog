#!/usr/bin/env node
// Prepare one of Gab's job photos for a post: blur number plates, crop to a shape, resize, save as WebP.
//
//   node scripts/photo.mjs <source> <out.webp> [options]
//
// Options (positions are fractions of the source image, 0 to 1, measured from the top-left):
//   --aspect 16:9        crop to this shape (default: keep the original shape)
//   --focus 0.5,0.5      the point to keep in the middle when cropping (x,y)
//   --blur x,y,w,h       blur a box, e.g. a number plate. Repeat for more boxes.
//   --width 1600         output width in pixels (default 1600, never enlarged)
//
// Example: a portrait photo as a 16:9 hero, keeping the lower half, with a plate blurred
//   node scripts/photo.mjs ../mobilepitstop-photos/photos/P028.webp content/posts/my-post/hero.webp \
//        --aspect 16:9 --focus 0.5,0.65 --blur 0.38,0.86,0.24,0.06

import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { loadSharp } from './lib/tools.mjs';

const args = process.argv.slice(2);
const [src, out] = args;
if (!src || !out) {
  console.error('Usage: node scripts/photo.mjs <source> <out.webp> [--aspect 16:9] [--focus x,y] [--blur x,y,w,h] [--width 1600]');
  process.exit(1);
}
const opt = { aspect: null, focus: [0.5, 0.5], blur: [], width: 1600 };
for (let i = 2; i < args.length; i++) {
  const v = args[i + 1];
  if (args[i] === '--aspect') (opt.aspect = v.split(':').map(Number)), i++;
  else if (args[i] === '--focus') (opt.focus = v.split(',').map(Number)), i++;
  else if (args[i] === '--blur') opt.blur.push(v.split(',').map(Number)), i++;
  else if (args[i] === '--width') (opt.width = Number(v)), i++;
  else throw new Error(`Unknown option ${args[i]}`);
}

const sharp = await loadSharp();
let img = sharp(src).rotate();
const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
const W = info.width;
const H = info.height;
let base = sharp(data, { raw: { width: W, height: H, channels: info.channels } });

// Blur boxes (number plates, house numbers).
if (opt.blur.length) {
  const layers = [];
  for (const [x, y, w, h] of opt.blur) {
    const left = clamp(Math.round(x * W), 0, W - 1);
    const top = clamp(Math.round(y * H), 0, H - 1);
    const width = clamp(Math.round(w * W), 1, W - left);
    const height = clamp(Math.round(h * H), 1, H - top);
    const patch = await sharp(data, { raw: { width: W, height: H, channels: info.channels } })
      .extract({ left, top, width, height })
      .resize(Math.max(1, Math.round(width / 24)), Math.max(1, Math.round(height / 24)))
      .resize(width, height, { kernel: 'nearest' })
      .blur(Math.max(2, Math.round(Math.min(width, height) / 6)))
      .png()
      .toBuffer();
    layers.push({ input: patch, left, top });
  }
  base = sharp(await base.composite(layers).png().toBuffer());
}

// Crop to the requested shape around the focus point.
if (opt.aspect) {
  const target = opt.aspect[0] / opt.aspect[1];
  let cw = W;
  let ch = Math.round(W / target);
  if (ch > H) {
    ch = H;
    cw = Math.round(H * target);
  }
  const left = clamp(Math.round(opt.focus[0] * W - cw / 2), 0, W - cw);
  const top = clamp(Math.round(opt.focus[1] * H - ch / 2), 0, H - ch);
  base = sharp(await base.extract({ left, top, width: cw, height: ch }).png().toBuffer());
}

await mkdir(path.dirname(path.resolve(out)), { recursive: true });
const res = await base.resize({ width: opt.width, withoutEnlargement: true }).webp({ quality: 80 }).toFile(out);
console.log(`${out}  ${res.width}x${res.height}  ${Math.round(res.size / 1024)} KB`);

function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n));
}
