// Structural lint: detect hardcoded Japanese (hiragana / katakana / kanji)
// in UI svelte files. v0.5.0 shipped with the displayMode option text in
// Japanese for English users, so this test catches regressions in CI.
//
// Target: popup / options / sidepanel svelte files (= what the browser shows).
//
// Rule:
// - Find lines that contain JP characters (hiragana U+3040-309F,
//   katakana U+30A0-30FF, CJK kanji U+4E00-9FFF).
// - Skip lines that look like JS or HTML comments.
// - Skip lines with the explicit `allow-jp` end-of-line marker.
// - Anything else with JP characters causes the test to fail.
//
// To allow a rare exception (non-user-facing literal), put `// allow-jp` at
// the end of the line.
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const UI_DIRS = [
  'entrypoints/popup',
  'entrypoints/options',
  'entrypoints/sidepanel',
  'entrypoints/history',
];

const JP_REGEX = /[぀-ゟ゠-ヿ一-鿿]/;

function listSvelteFiles(dir: string): string[] {
  const out: string[] = [];
  try {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      const s = statSync(path);
      if (s.isDirectory()) out.push(...listSvelteFiles(path));
      else if (name.endsWith('.svelte')) out.push(path);
    }
  } catch { /* dir missing — OK */ }
  return out;
}

function listTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const s = statSync(path);
    if (s.isDirectory()) out.push(...listTsFiles(path));
    else if (name.endsWith('.ts')) out.push(path);
  }
  return out;
}

function stripComments(line: string): string {
  // Strip inline /* ... */ blocks (single-line only).
  let s = line.replace(/\/\*[\s\S]*?\*\//g, '');
  // Strip everything after `//` (heuristic: works when // is not inside a string).
  // Avoid stripping `://` (URL) by requiring whitespace or start-of-line before //.
  s = s.replace(/(?:^|\s)\/\/.*$/, '');
  // Strip HTML comments
  s = s.replace(/<!--[\s\S]*?-->/g, '');
  return s;
}

function isAllowed(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed.startsWith('//')) return true;
  if (trimmed.startsWith('*') || trimmed.startsWith('/*')) return true;
  if (trimmed.endsWith('*/')) return true;
  // explicit allow markers
  if (/\/\/\s*allow-jp\b/.test(line)) return true;
  if (/<!--\s*allow-jp\b/.test(line)) return true;
  return false;
}

describe('UI svelte files: no hardcoded Japanese text', () => {
  for (const dir of UI_DIRS) {
    for (const file of listSvelteFiles(dir)) {
      it(`${file} routes all JP text through i18n`, () => {
        const content = readFileSync(file, 'utf8');
        const lines = content.split('\n');
        const offenders: { line: number; text: string }[] = [];
        let inHtmlComment = false;
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i]!;
          if (inHtmlComment) {
            if (line.includes('-->')) inHtmlComment = false;
            continue;
          }
          if (line.includes('<!--') && !line.includes('-->')) {
            inHtmlComment = true;
            continue;
          }
          if (!JP_REGEX.test(line)) continue;
          if (isAllowed(line)) continue;
          // Strip inline comments before checking — JP inside `// foo` or
          // `/* foo */` is fine, only JP in code/strings is an offense.
          const codeOnly = stripComments(line);
          if (!JP_REGEX.test(codeOnly)) continue;
          offenders.push({ line: i + 1, text: line.trim().slice(0, 120) });
        }
        if (offenders.length > 0) {
          const msg = offenders
            .map((o) => `  ${file}:${o.line}: ${o.text}`)
            .join('\n');
          throw new Error(
            `Hardcoded Japanese in UI svelte file. Move the text into ` +
            `locales/{en,ja}/messages.json and use t('key'):\n${msg}`,
          );
        }
        expect(offenders).toEqual([]);
      });
    }
  }
});

describe('messages.json invariants', () => {
  const en = JSON.parse(readFileSync('locales/en/messages.json', 'utf8')) as Record<string, unknown>;
  const enKeys = new Set(Object.keys(en));

  it('ja is fully translated (= same key set as en)', () => {
    const ja = JSON.parse(readFileSync('locales/ja/messages.json', 'utf8')) as Record<string, unknown>;
    const jaKeys = new Set(Object.keys(ja));
    const enOnly = [...enKeys].filter((k) => !jaKeys.has(k));
    const jaOnly = [...jaKeys].filter((k) => !enKeys.has(k));
    if (enOnly.length > 0 || jaOnly.length > 0) {
      throw new Error(
        `en / ja mismatch:\n` +
        `  en only: ${enOnly.join(', ') || '(none)'}\n` +
        `  ja only: ${jaOnly.join(', ') || '(none)'}`,
      );
    }
    expect(enOnly).toEqual([]);
    expect(jaOnly).toEqual([]);
  });

  // 31 言語対応 (v0.5.2〜): 他 locale は partial 翻訳 OK (en に fallback)。
  // ただし 「en に無い key を持つ」 のは禁止 (typo / stale key の事故防止)。
  it('every non-en locale has only keys that exist in en (no orphan keys)', () => {
    const locales = readdirSync('locales')
      .filter((d) => d !== 'en' && statSync(join('locales', d)).isDirectory());
    const errors: string[] = [];
    for (const loc of locales) {
      try {
        const data = JSON.parse(readFileSync(`locales/${loc}/messages.json`, 'utf8')) as Record<string, unknown>;
        const orphan = Object.keys(data).filter((k) => !enKeys.has(k));
        if (orphan.length > 0) {
          errors.push(`  ${loc}: orphan keys (not in en): ${orphan.join(', ')}`);
        }
      } catch (e) {
        errors.push(`  ${loc}: failed to parse: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    if (errors.length > 0) throw new Error(`locale orphan keys:\n${errors.join('\n')}`);
    expect(errors).toEqual([]);
  });

  it('every locale translates user-action messages used outside the Tutti UI pages', () => {
    const required = [
      'runtimePixivSecurityPrompt',
      'runtimePixivSecurityResuming',
      'runtimePixivSecurityTimeout',
      'userActionRequiredNotifyTitle',
      'userActionRequiredCaptcha',
    ];
    const errors: string[] = [];
    for (const loc of readdirSync('locales')) {
      const path = join('locales', loc, 'messages.json');
      if (!statSync(join('locales', loc)).isDirectory()) continue;
      const data = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
      const missing = required.filter((key) => !data[key]);
      if (missing.length > 0) errors.push(`  ${loc}: missing ${missing.join(', ')}`);
    }
    if (errors.length > 0) throw new Error(`locale required keys:\n${errors.join('\n')}`);
    expect(errors).toEqual([]);
  });
});

describe('runtime errors: no hardcoded Japanese text', () => {
  it('routes user-visible TS errors through i18n', () => {
    const offenders: string[] = [];
    const runtimeLiteral = /(?:throw new Error\([^\n]*|error:\s*[^\n]*|\.textContent\s*=\s*[^\n]*|^\s*\?\s*`[^`]*)[぀-ゟ゠-ヿ一-鿿]/;
    for (const file of [...listTsFiles('entrypoints'), ...listTsFiles('src')]) {
      if (file.endsWith('no-hardcoded-japanese.test.ts')) continue;
      const lines = readFileSync(file, 'utf8').split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (runtimeLiteral.test(lines[i]!)) offenders.push(`${file}:${i + 1}: ${lines[i]!.trim()}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
