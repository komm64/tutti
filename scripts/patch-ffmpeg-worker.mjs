/**
 * Chrome Web Store MV3 review flags remotely hosted code strings, even when the
 * URL is only a fallback inside @ffmpeg/ffmpeg's generated worker.
 *
 * The app passes extension-local coreURL/wasmURL at runtime, so replacing this
 * fallback with the packaged ffmpeg core keeps behavior local and review-safe.
 */

import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const outputDir = resolve(root, '.output/chrome-mv3');
const remoteUrl = 'https://unpkg.com/@ffmpeg/core@0.12.9/dist/umd/ffmpeg-core.js';
const localUrl = '/ffmpeg/ffmpeg-core.js';
const textExtensions = new Set(['.html', '.js', '.json', '.css', '.map', '.txt']);

if (!existsSync(outputDir)) {
  console.error(`[patch-ffmpeg-worker] missing output dir: ${outputDir}`);
  process.exit(1);
}

let patched = 0;
const remaining = [];

function visit(path) {
  const stat = statSync(path);
  if (stat.isDirectory()) {
    for (const name of readdirSync(path)) {
      visit(join(path, name));
    }
    return;
  }

  if (!textExtensions.has(extname(path))) return;

  const original = readFileSync(path, 'utf8');
  if (!original.includes(remoteUrl)) return;

  const next = original.replaceAll(remoteUrl, localUrl);
  writeFileSync(path, next);
  patched += 1;

  if (next.includes(remoteUrl)) {
    remaining.push(relative(root, path));
  }
}

visit(outputDir);

if (remaining.length > 0) {
  console.error(`[patch-ffmpeg-worker] remote ffmpeg URL remains in: ${remaining.join(', ')}`);
  process.exit(1);
}

console.log(`[patch-ffmpeg-worker] patched ${patched} generated file(s)`);
