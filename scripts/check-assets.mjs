/**
 * Static release guards — the checks that need no DOM and no logic, only the
 * files as they sit on disk:
 *
 *   1. Every JS/CSS file in the repo is listed in sw.js ASSETS, and every listed
 *      asset exists. A missing entry silently breaks the app offline.
 *   2. The entry <script type="module"> carries no query string, so the browser
 *      cannot evaluate app.js twice (views import it without one).
 *   3. package.json version, APP_VERSION and CHANGELOG.md agree.
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

// 3. The entry module must be imported under exactly one URL.
// ES modules are keyed by URL, so `app.js?v=123` in index.html and `../app.js`
// in the views are two modules with two copies of the router, the service-worker
// registration and the install state. It "works", twice over, until it doesn't.
const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
const entry = html.match(/<script[^>]*\btype="module"[^>]*\bsrc="([^"]+)"/);
if (!entry) errors.push('index.html has no <script type="module"> entry point');
else if (entry[1].includes('?')) {
  errors.push(`index.html loads the entry module as "${entry[1]}" — a query string makes the browser evaluate it twice, since views import it without one`);
}

// 4. One version number, spelled the same in three places.
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const appVersion = readFileSync(join(ROOT, 'js/app.js'), 'utf8').match(/APP_VERSION\s*=\s*'([^']+)'/)?.[1];
if (!appVersion) errors.push('js/app.js no longer exports a literal APP_VERSION');
else if (appVersion !== pkg.version) {
  errors.push(`version mismatch: package.json is ${pkg.version}, APP_VERSION is ${appVersion}`);
}

const changelog = readFileSync(join(ROOT, 'CHANGELOG.md'), 'utf8');
if (!new RegExp(`^##\\s+${pkg.version.replace(/\./g, '\\.')}\\b`, 'm').test(changelog)) {
  errors.push(`CHANGELOG.md has no "## ${pkg.version}" section — every released version needs an entry`);
}

if (errors.length) {
  console.error('Release check failed:');
  for (const e of errors) console.error(`  • ${e}`);
  process.exit(1);
}

console.log(`✓ sw.js caches all ${sources.length} source files, single entry module, version ${pkg.version} consistent`);
