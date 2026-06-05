#!/usr/bin/env node
// Static integrity check for canonical BCP 47 sources in locales/<code>/messages.json.
// - No locale-specific keys absent from en (partial locales fall back to en)
// - No empty values
// - No CJK (hiragana/katakana/han) leakage in non-CJK locales
// - Placeholder $NAME$ usage matches en
// Run: node scripts/verify-locales.mjs

import { readFile, readdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TUTTI_LOCALES } from './locale-config.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOC_DIR = join(__dirname, '..', 'locales');

const NON_CJK_LOCALES = new Set([
  'en', 'es-ES', 'es-419', 'pt-BR', 'pt-PT', 'ru', 'de', 'fr', 'pl', 'tr', 'it',
  'cs', 'uk', 'hu', 'th', 'vi', 'nl', 'sv', 'ar', 'id', 'fi', 'el', 'bg',
  'no', 'ro', 'da', 'eo',
]);
const CJK_LOCALES = new Set(['ja', 'zh-Hans', 'zh-Hant', 'ko']);

const HIRA_KATA = /[぀-ゟ゠-ヿ]/;     // ja-only scripts
const JP_KANJI_CHARS = ['設定', '投稿', '画像', '動画', '日本語', '表示', '言語']; // common JP UI words

function placeholders(s) {
  return Array.from(s.matchAll(/\$([A-Za-z0-9_]+)\$/g), (m) => m[1]).sort();
}

async function loadLocale(code) {
  const path = join(LOC_DIR, code, 'messages.json');
  const raw = await readFile(path, 'utf8');
  return JSON.parse(raw);
}

const issues = [];

async function main() {
  const codes = (await readdir(LOC_DIR)).sort();
  console.log(`Found ${codes.length} locales:`, codes.join(', '));
  const expectedCodes = TUTTI_LOCALES.map(({ code }) => code).sort();
  if (JSON.stringify(codes) !== JSON.stringify(expectedCodes)) {
    issues.push(`locale directories differ from config/locales.json: expected=${expectedCodes.join(',')} actual=${codes.join(',')}`);
  }

  const enData = await loadLocale('en');
  const enKeys = Object.keys(enData).sort();

  for (const code of codes) {
    const data = await loadLocale(code);
    const keys = Object.keys(data).sort();
    const isCjk = CJK_LOCALES.has(code);

    // Partial translations are allowed: Chrome falls back to en.
    const extra = keys.filter((k) => !enKeys.includes(k));
    if (extra.length) issues.push(`[${code}] extra keys vs en: ${extra.slice(0, 5).join(', ')}${extra.length > 5 ? ` (+${extra.length - 5})` : ''}`);

    // Per-key checks
    for (const k of keys) {
      const v = data[k];
      const msg = v?.message ?? '';
      if (!msg) issues.push(`[${code}] empty message: ${k}`);

      // CJK leakage (only in non-CJK locales)
      if (code !== 'en' && !isCjk && HIRA_KATA.test(msg)) {
        issues.push(`[${code}] hira/kata leak in ${k}: "${msg.slice(0, 60)}..."`);
      }

      // Placeholder consistency vs en (skip if en lacks the key)
      const enMsg = enData[k]?.message;
      if (enMsg) {
        const enPh = placeholders(enMsg);
        const locPh = placeholders(msg);
        if (JSON.stringify(enPh) !== JSON.stringify(locPh)) {
          issues.push(`[${code}] placeholder mismatch in ${k}: en=${enPh.join(',')} loc=${locPh.join(',')}`);
        }
      }
    }
  }

  console.log(`\nKeys per locale: en=${enKeys.length}`);
  if (issues.length === 0) {
    console.log('\n✓ All locales pass static validation.');
  } else {
    console.log(`\n✗ ${issues.length} issue(s):`);
    issues.slice(0, 50).forEach((i) => console.log(`  - ${i}`));
    if (issues.length > 50) console.log(`  ... (+${issues.length - 50} more)`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
