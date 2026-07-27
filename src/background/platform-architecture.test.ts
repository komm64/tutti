import { describe, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import {
  assertArchitectureGuard,
  type TemporaryArchitectureAllowance,
} from '../../tests/architecture-guard';
import { PLATFORM_IDS } from '../types/platform';

const GUARDED_ORCHESTRATORS = [
  'src/background/diagnostics.ts',
  'src/background/history-recorder.ts',
  'src/background/media-preprocess.ts',
  'src/background/platform-poster.ts',
  'src/background/post-concurrency.ts',
  'src/background/post-scheduler.ts',
  'src/background/post-worker-pool.ts',
  'src/background/posting-state.ts',
  'src/background/submission-guard.ts',
  'src/popup/platforms.ts',
  'src/popup/post-media.ts',
  'src/popup/post-submit.ts',
] as const;

const PLATFORM_LITERAL_ALLOWANCES: readonly TemporaryArchitectureAllowance[] = [];

const PLATFORM_COLLECTION_PATTERNS = [
  {
    label: 'Set<PlatformId> literal',
    pattern: /new\s+Set\s*<\s*PlatformId\s*>\s*\(\s*\[\s*['"`]/g,
  },
  {
    label: 'PlatformId[] literal',
    pattern: /:\s*(?:readonly\s+)?PlatformId\s*\[\s*]\s*=\s*\[\s*['"`]/g,
  },
] as const;

describe('platform architecture guard', () => {
  it('rejects non-empty platform-keyed Set and array literals in production TypeScript', () => {
    const violations: string[] = [];
    for (const path of productionTypeScriptFiles('src')) {
      const source = readFileSync(path, 'utf8');
      for (const { label, pattern } of PLATFORM_COLLECTION_PATTERNS) {
        const matches = source.matchAll(new RegExp(pattern.source, pattern.flags));
        for (const match of matches) {
          const line = source.slice(0, match.index).split(/\r?\n/).length;
          violations.push(`${relative('.', path)}:${line}: ${label}`);
        }
      }
    }
    assertArchitectureGuard({
      guard: 'platform-keyed-collections',
      violations,
    });
  });

  it('rejects new direct platform comparisons in central orchestrators', () => {
    const platformAlternation = PLATFORM_IDS.join('|');
    const directComparison = new RegExp(
      `\\b(?:platform|adapter\\.id|id)\\s*(?:===|!==)\\s*['"](?:${platformAlternation})['"]`,
    );
    const reverseComparison = new RegExp(
      `['"](?:${platformAlternation})['"]\\s*(?:===|!==)\\s*(?:platform|adapter\\.id|id)\\b`,
    );

    const violations: string[] = [];
    for (const path of GUARDED_ORCHESTRATORS) {
      const actual = readFileSync(path, 'utf8')
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => directComparison.test(line) || reverseComparison.test(line))
        .sort();
      violations.push(...actual.map((line) => `${path}: ${line}`));
    }
    assertArchitectureGuard({
      guard: 'central-platform-literals',
      violations,
      allowances: PLATFORM_LITERAL_ALLOWANCES,
    });
  });
});

function productionTypeScriptFiles(root: string): string[] {
  const files: string[] = [];
  for (const name of readdirSync(root)) {
    const path = resolve(root, name);
    if (statSync(path).isDirectory()) {
      files.push(...productionTypeScriptFiles(path));
    } else if (path.endsWith('.ts') && !path.endsWith('.test.ts')) {
      files.push(path);
    }
  }
  return files;
}
