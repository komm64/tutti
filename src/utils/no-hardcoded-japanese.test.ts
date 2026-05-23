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
            `public/_locales/{en,ja}/messages.json and use t('key'):\n${msg}`,
          );
        }
        expect(offenders).toEqual([]);
      });
    }
  }
});

describe('messages.json: en and ja key sets must match', () => {
  it('every en key has a ja counterpart and vice versa', () => {
    const en = JSON.parse(readFileSync('public/_locales/en/messages.json', 'utf8')) as Record<string, unknown>;
    const ja = JSON.parse(readFileSync('public/_locales/ja/messages.json', 'utf8')) as Record<string, unknown>;
    const enKeys = new Set(Object.keys(en));
    const jaKeys = new Set(Object.keys(ja));
    const enOnly = [...enKeys].filter((k) => !jaKeys.has(k));
    const jaOnly = [...jaKeys].filter((k) => !enKeys.has(k));
    if (enOnly.length > 0 || jaOnly.length > 0) {
      throw new Error(
        `messages.json mismatch:\n` +
        `  en only: ${enOnly.join(', ') || '(none)'}\n` +
        `  ja only: ${jaOnly.join(', ') || '(none)'}`,
      );
    }
    expect(enOnly).toEqual([]);
    expect(jaOnly).toEqual([]);
  });
});
