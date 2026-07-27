import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';

type EntrypointCategory = 'background' | 'content' | 'offscreen' | 'ui';

const ALLOWED_SRC_IMPORTS: Record<EntrypointCategory, readonly string[]> = {
  background: [
    'src/background/',
    'src/messages',
    'src/storage',
    'src/types/',
    'src/utils/',
  ],
  content: [
    'src/adapters/',
    'src/messages',
    'src/storage',
    'src/types/',
    'src/utils/',
  ],
  offscreen: [
    'src/messages',
    'src/types/',
    'src/utils/',
  ],
  ui: [
    'src/adapters/',
    'src/api/',
    'src/messages',
    'src/popup/',
    'src/storage',
    'src/types/',
    'src/utils/',
  ],
};

describe('entrypoint architecture guard', () => {
  it('keeps src imports inside each entrypoint category boundary', () => {
    const violations: string[] = [];
    for (const path of entrypointSourceFiles('entrypoints')) {
      const source = readFileSync(path, 'utf8');
      const category = categorize(path);
      for (const specifier of importSpecifiers(source)) {
        if (!specifier.startsWith('.')) continue;
        const resolved = normalize(relative('.', resolve(dirname(path), specifier)));
        if (!resolved.startsWith('src/')) continue;
        if (ALLOWED_SRC_IMPORTS[category].some((allowed) => isAllowedImport(resolved, allowed))) {
          continue;
        }
        violations.push(`${normalize(relative('.', path))}: ${category} -> ${resolved}`);
      }
    }
    expect(violations).toEqual([]);
  });

  it('keeps runtime message branching out of the background entrypoint', () => {
    const source = readFileSync('entrypoints/background.ts', 'utf8');
    expect(source).toContain('browser.runtime.onMessage.addListener(handleRuntimeMessage)');
    expect(source).not.toMatch(/\b(?:msg|message)\.type\s*(?:===|!==)/);
    expect(source).not.toMatch(/function\s+handlePostRequest\b/);
  });

  it('keeps popup history lifecycle in the composer controller', () => {
    const source = readFileSync('entrypoints/popup/App.svelte', 'utf8');
    expect(source).toContain('composerController.subscribeHistory');
    expect(source).not.toContain('loadPopupHistoryThumbs');
    expect(source).not.toContain('storage.onChanged');
  });
});

function categorize(path: string): EntrypointCategory {
  const normalized = normalize(relative('.', path));
  if (normalized === 'entrypoints/background.ts') return 'background';
  if (normalized.endsWith('.content.ts')) return 'content';
  if (normalized.startsWith('entrypoints/offscreen/')) return 'offscreen';
  return 'ui';
}

function importSpecifiers(source: string): string[] {
  const specifiers: string[] = [];
  for (const match of source.matchAll(/\bfrom\s+['"]([^'"]+)['"]/g)) {
    if (match[1]) specifiers.push(match[1]);
  }
  for (const match of source.matchAll(/\bimport\s+['"]([^'"]+)['"]/g)) {
    if (match[1]) specifiers.push(match[1]);
  }
  return specifiers;
}

function entrypointSourceFiles(root: string): string[] {
  const files: string[] = [];
  for (const name of readdirSync(root)) {
    const path = resolve(root, name);
    if (statSync(path).isDirectory()) {
      files.push(...entrypointSourceFiles(path));
    } else if (path.endsWith('.ts') || path.endsWith('.svelte')) {
      files.push(path);
    }
  }
  return files;
}

function normalize(path: string): string {
  return path.split(sep).join('/');
}

function isAllowedImport(path: string, allowed: string): boolean {
  return allowed.endsWith('/') ? path.startsWith(allowed) : path === allowed;
}
