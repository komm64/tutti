import { describe, expect, it } from 'vitest';
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
  'src/background/post-orchestrator.ts',
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

  it('keeps post result construction out of the central poster', () => {
    const orchestrator = readFileSync('src/background/post-orchestrator.ts', 'utf8');

    expect(orchestrator).toContain("from './post-result-policy'");
    expect(orchestrator).not.toMatch(
      /\bfunction (?:buildFinalChunkResult|unconfirmedPostResult|withFlow)\b/,
    );
  });

  it('keeps DOM attempt policy out of the central poster', () => {
    const orchestrator = readFileSync('src/background/post-orchestrator.ts', 'utf8');
    const transport = readFileSync('src/background/posting-transport.ts', 'utf8');

    expect(transport).toContain("from './dom-attempt-policy'");
    expect(orchestrator).not.toMatch(
      /\bfunction (?:buildDomPostAttempts|resolvePreSubmitLoadOptions|shouldOpenActive|shouldRetryPostAttempt|shouldReuseExistingTabForAttempt)\b/,
    );
  });

  it('keeps URL capture and verification completion in PostConfirmation', () => {
    const orchestrator = readFileSync('src/background/post-orchestrator.ts', 'utf8');

    expect(orchestrator).toContain("from './post-confirmation'");
    expect(orchestrator).not.toMatch(
      /\bfunction (?:attachVerifyResult|buildVerifyExpectationForChunk|captureUrl|ensurePostUrl|maybeAutoOpenPostUrl|recoverFromAmbiguousDispatchFailure)\b/,
    );
  });

  it('keeps single-chunk API and DOM effects in PostingTransport', () => {
    const orchestrator = readFileSync('src/background/post-orchestrator.ts', 'utf8');

    expect(orchestrator).toContain("from './posting-transport'");
    expect(orchestrator).not.toMatch(
      /\bfunction (?:closeOwnedAttemptTab|getComposeUrlForMedia|postSingleChunk|postSingleChunkWithRetry|resolveApiPostOutcome)\b/,
    );
    expect(orchestrator).not.toContain('sendPostMessageWhenReady');
    expect(orchestrator).not.toContain('tryApiPath');
  });

  it('keeps one current orchestrator behind the root poster boundary', () => {
    const poster = readFileSync('src/background/platform-poster.ts', 'utf8');
    const orchestrator = readFileSync('src/background/post-orchestrator.ts', 'utf8');
    const transport = readFileSync('src/background/posting-transport.ts', 'utf8');
    const contract = readFileSync(
      'src/background/posting-orchestrator-contract.ts',
      'utf8',
    );

    expect(poster).toContain('const orchestrator = createNextPostOrchestrator(options)');
    expect(poster).not.toContain('createLegacyPostOrchestrator');
    expect(readFileSync('src/background/post-request-handler.ts', 'utf8'))
      .toContain('platformPoster.postToPlatform(');
    expect(orchestrator).toContain('createNextPostOrchestrator');
    expect(orchestrator).not.toContain('postOptions.postingAlgorithm');
    expect(transport).not.toContain('postOptions.postingAlgorithm');
    expect(contract).toContain('interface PostingOrchestrator');
    expect(contract).toContain('interface PostExecutionOptions');
  });

  it('removes the expired legacy posting implementation', () => {
    expect(() => readFileSync(
      'src/background/legacy-post-orchestrator.ts',
      'utf8',
    )).toThrow();
    expect(readFileSync('src/background/platform-poster.ts', 'utf8'))
      .not.toContain('legacy');
  });

  it('keeps stored page-world API URL capture in its strategy module', () => {
    const capture = readFileSync('src/background/post-url-capture.ts', 'utf8');

    expect(capture).toContain("from './post-url-stored-api'");
    expect(capture).not.toContain("'tutti:ig-latest-post'");
    expect(capture).not.toContain("'tutti:mastodon-latest-post'");
    expect(capture).not.toContain("'tutti:threads-latest-post'");
    expect(capture).not.toContain("'tutti:tumblr-latest-post'");
  });

  it('keeps Mastodon public API URL capture in its strategy module', () => {
    const capture = readFileSync('src/background/post-url-capture.ts', 'utf8');

    expect(capture).toContain("from './post-url-mastodon-api'");
    expect(capture).not.toMatch(
      /\bfunction (?:captureMastodonPostViaPublicApi|fetchMastodonAccountId|inferMastodonInstance|resolveMastodonIdentity|stripHtml)\b/,
    );
  });

  it('keeps serialized MAIN-world URL lookup in its strategy module', () => {
    const capture = readFileSync('src/background/post-url-capture.ts', 'utf8');

    expect(capture).toContain("from './post-url-in-page'");
    expect(capture).toContain('func: capturePostUrlInPage');
    expect(capture).not.toContain("platformName === 'x'");
    expect(capture).not.toContain("localStorage.getItem('BSKY_STORAGE')");
  });

  it('keeps YouTube Studio completion in its strategy module', () => {
    const capture = readFileSync('src/background/post-url-capture.ts', 'utf8');

    expect(capture).toContain("from './post-url-youtube-studio'");
    expect(capture).not.toMatch(
      /\bfunction (?:captureYouTubeStudioPostUrlFromTab|captureYouTubeStudioPostUrlInPage)\b/,
    );
    expect(capture).not.toContain('reload YouTube Studio before URL capture');
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
