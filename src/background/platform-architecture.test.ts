import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { PLATFORM_IDS } from '../types/platform';

interface LiteralAllowance {
  line: string;
  reason: string;
  owner: string;
  removalPhase: string;
}

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

const PLATFORM_LITERAL_ALLOWLIST: Partial<Record<
  (typeof GUARDED_ORCHESTRATORS)[number],
  LiteralAllowance[]
>> = {
  'src/background/platform-poster.ts': [
    {
      line: "const useInlineThread = adapter.id === 'bluesky' || (adapter.id === 'x' && !autoPost);",
      reason: 'Inline multi-chunk compose is an existing background strategy procedure.',
      owner: 'Issue #12 Phase 2 strategy migration',
      removalPhase: 'Phase 2 before closure',
    },
    {
      line: "const canUseApiWithReplyUrl = adapter.id === 'mastodon' && !!replyToUrl;",
      reason: 'Mastodon API continuation capability still needs a strategy-owned predicate.',
      owner: 'Issue #12 Phase 2 strategy migration',
      removalPhase: 'Phase 2 before closure',
    },
    {
      line: "if (adapter.id === 'tumblr' && hasVideo) return 'https://www.tumblr.com/new/video';",
      reason: 'Tumblr media-specific compose URL still needs a strategy-owned resolver.',
      owner: 'Issue #12 Phase 2 strategy migration',
      removalPhase: 'Phase 2 before closure',
    },
    {
      line: "adapter.id === 'x' && dryRun && !!textChunks && textChunks.length > 1;",
      reason: 'X inline-thread preview focus still needs a strategy-owned predicate.',
      owner: 'Issue #12 Phase 2 strategy migration',
      removalPhase: 'Phase 2 before closure',
    },
    {
      line: "const expectedUrls = platform === 'tumblr' ? extractHttpUrls(chunkText) : [];",
      reason: 'Tumblr verification URL expectation still needs a strategy-owned builder.',
      owner: 'Issue #12 Phase 2 strategy migration',
      removalPhase: 'Phase 2 before closure',
    },
  ],
};

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
    expect(violations).toEqual([]);
  });

  it('rejects new direct platform comparisons in central orchestrators', () => {
    const platformAlternation = PLATFORM_IDS.join('|');
    const directComparison = new RegExp(
      `\\b(?:platform|adapter\\.id|id)\\s*(?:===|!==)\\s*['"](?:${platformAlternation})['"]`,
    );
    const reverseComparison = new RegExp(
      `['"](?:${platformAlternation})['"]\\s*(?:===|!==)\\s*(?:platform|adapter\\.id|id)\\b`,
    );

    for (const path of GUARDED_ORCHESTRATORS) {
      const actual = readFileSync(path, 'utf8')
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => directComparison.test(line) || reverseComparison.test(line))
        .sort();
      const allowed = (PLATFORM_LITERAL_ALLOWLIST[path] ?? [])
        .map(({ line }) => line)
        .sort();
      expect(actual, path).toEqual(allowed);
    }
  });

  it('requires actionable metadata for every temporary literal allowance', () => {
    for (const allowances of Object.values(PLATFORM_LITERAL_ALLOWLIST)) {
      for (const allowance of allowances ?? []) {
        expect(allowance.reason.length).toBeGreaterThan(20);
        expect(allowance.owner).toMatch(/^Issue #\d+/);
        expect(allowance.removalPhase).toBe('Phase 2 before closure');
      }
    }
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
