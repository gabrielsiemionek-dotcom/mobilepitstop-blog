// Finds Playwright and sharp whether they're installed in this repo or globally
// (Claude's workspace has them under /opt/npm-tools).

import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const GLOBAL_DIRS = ['/opt/npm-tools/node_modules', '/usr/local/lib/node_modules', '/usr/lib/node_modules'];

function resolve(name) {
  try {
    return require.resolve(name);
  } catch {}
  for (const dir of GLOBAL_DIRS) {
    try {
      return require.resolve(path.join(dir, name));
    } catch {}
  }
  throw new Error(`${name} isn't installed. Run: npm install ${name}`);
}

export async function loadSharp() {
  const mod = await import(pathToFileURL(resolve('sharp')).href);
  return mod.default || mod;
}

export async function loadChromium() {
  const mod = await import(pathToFileURL(resolve('playwright')).href);
  return (mod.default || mod).chromium;
}
