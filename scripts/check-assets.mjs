/**
 * Guards the offline cache: every JS/CSS file in the repo must be listed in
 * sw.js ASSETS, and every listed asset must exist. A missing entry means the
 * app silently breaks offline after a new module is added — this catches it in CI.
 *
 * Run: node scripts/check-assets.mjs
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const sw = readFileSync(join(ROOT, 'sw.js'), 'utf8');

const listed = [...sw.matchAll(/'(\.\/[^']*)'/g)].map((m) => m[1]);
const errors = [];

// 1. Everything listed must exist on disk (skip the bare directory entry).
for (const asset of listed) {
  if (asset === './') continue;
  if (!existsSync(join(ROOT, asset))) errors.push(`listed in sw.js but missing on disk: ${asset}`);
}

// 2. Every source file must be listed.
function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    if (entry.startsWith('.') || entry === 'node_modules' || entry === 'scripts') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

const sources = walk(ROOT)
  .map((f) => `./${relative(ROOT, f).split(sep).join('/')}`)
  .filter((f) => /\.(js|css|webmanifest)$/.test(f))
  .filter((f) => f !== './sw.js');

for (const src of sources) {
  if (!listed.includes(src)) errors.push(`not cached by sw.js — add it to ASSETS: ${src}`);
}

if (errors.length) {
  console.error('Asset manifest check failed:');
  for (const e of errors) console.error(`  • ${e}`);
  process.exit(1);
}

console.log(`✓ sw.js caches all ${sources.length} source files, and every listed asset exists`);
