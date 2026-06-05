#!/usr/bin/env node
// Generate Chrome-specific `_locales` directories from canonical BCP 47 sources.

import { cp, mkdir, rm } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TUTTI_LOCALES, toChromeLocaleDir } from './locale-config.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SOURCE_DIR = join(ROOT, 'locales');
const OUTPUT_DIR = join(ROOT, 'public', '_locales');

await rm(OUTPUT_DIR, { recursive: true, force: true });
await mkdir(OUTPUT_DIR, { recursive: true });

for (const { code } of TUTTI_LOCALES) {
  await cp(join(SOURCE_DIR, code), join(OUTPUT_DIR, toChromeLocaleDir(code)), { recursive: true });
}

console.log(`Generated ${TUTTI_LOCALES.length} Chrome locale directories.`);
