/**
 * Patch @ffmpeg/ffmpeg's packaged fallback core URL before WXT bundles it.
 *
 * @ffmpeg/ffmpeg includes a CDN fallback for ffmpeg-core.js. Tutti always passes
 * extension-local coreURL/wasmURL, but Chrome Web Store MV3 review still flags
 * the fallback string after bundling. This keeps the bundled fallback local.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const remoteUrl = 'https://unpkg.com/@ffmpeg/core@0.12.9/dist/umd/ffmpeg-core.js';
const localUrl = '/ffmpeg/ffmpeg-core.js';
const targets = [
  'node_modules/@ffmpeg/ffmpeg/dist/esm/const.js',
  'node_modules/@ffmpeg/ffmpeg/dist/umd/814.ffmpeg.js',
];

let patched = 0;

for (const target of targets) {
  const path = resolve(root, target);
  if (!existsSync(path)) {
    console.error(`[patch-ffmpeg-package] missing file: ${relative(root, path)}`);
    process.exit(1);
  }

  const original = readFileSync(path, 'utf8');
  if (!original.includes(remoteUrl)) {
    continue;
  }

  writeFileSync(path, original.replaceAll(remoteUrl, localUrl));
  patched += 1;
}

console.log(`[patch-ffmpeg-package] patched ${patched} package file(s)`);
