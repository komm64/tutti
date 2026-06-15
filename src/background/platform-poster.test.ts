import { describe, expect, it } from 'vitest';
import type { PlatformAdapter } from '../adapters/types';
import {
  buildVerifyExpectationForChunk,
  buildFinalChunkResult,
  buildDomPostAttempts,
  buildReplyOverrideUrl,
  shouldReuseExistingTabForAttempt,
} from './platform-poster';

function adapter(overrides: Partial<PlatformAdapter> = {}): PlatformAdapter {
  return {
    id: 'threads',
    name: 'Threads',
    charLimit: 500,
    matchUrl: (url) => url.startsWith('https://www.threads.com/'),
    getComposeUrl: (text) => `https://www.threads.com/intent/post?text=${encodeURIComponent(text)}`,
    prefillsViaUrl: true,
    imageConstraints: { maxBytesPerImage: 8 * 1024 * 1024, maxImages: 10 },
    kinds: ['text', 'image'],
    ...overrides,
  };
}

describe('platform poster helpers', () => {
  it('builds X reply intent URLs from previous post URLs', () => {
    expect(buildReplyOverrideUrl('x', 1, 'https://x.com/alice/status/123456')).toBe(
      'https://x.com/intent/post?in_reply_to=123456',
    );
  });

  it('does not build reply URLs without a continuation target or for unsupported platforms', () => {
    expect(buildReplyOverrideUrl('x', 0, 'https://x.com/alice/status/123456')).toBeUndefined();
    expect(buildReplyOverrideUrl('bluesky', 1, 'https://bsky.app/profile/alice/post/abc')).toBeUndefined();
    expect(buildReplyOverrideUrl('x', 1, 'https://x.com/home')).toBeUndefined();
  });

  it('opens Mastodon and Threads continuation chunks from the previous post URL', () => {
    expect(buildReplyOverrideUrl('mastodon', 1, 'https://mastodon.social/@alice/1234567890')).toBe(
      'https://mastodon.social/@alice/1234567890',
    );
    expect(buildReplyOverrideUrl('threads', 1, 'https://www.threads.com/@alice/post/ABC123')).toBe(
      'https://www.threads.com/@alice/post/ABC123',
    );
  });

  it('builds safe pre-submit fallback attempts for normal SNS posting', () => {
    expect(buildDomPostAttempts(adapter(), true)).toEqual([
      { label: 'default' },
      {
        label: 'fresh foreground compose',
        skipApi: true,
        forceActive: true,
        reuseExistingTab: false,
        loadRetries: 1,
        delayBeforeMs: 750,
      },
      {
        label: 'fresh foreground compose with reload retry',
        skipApi: true,
        forceActive: true,
        reuseExistingTab: false,
        loadRetries: 2,
        delayBeforeMs: 1000,
      },
    ]);
  });

  it('keeps foreground-only SNS retries shorter because the first attempt is already foreground', () => {
    expect(buildDomPostAttempts(adapter({ requiresForegroundTab: true }), true)).toEqual([
      { label: 'default' },
      {
        label: 'fresh foreground compose',
        skipApi: true,
        forceActive: true,
        reuseExistingTab: false,
        loadRetries: 1,
        delayBeforeMs: 750,
      },
    ]);
  });

  it('uses a shorter retry pause for preview because no post can have been submitted', () => {
    expect(buildDomPostAttempts(adapter(), false)[1]).toMatchObject({
      label: 'fresh foreground compose',
      delayBeforeMs: 250,
    });
  });

  it('does not reuse existing tabs for foreground-only preview flows', () => {
    expect(shouldReuseExistingTabForAttempt(adapter(), false)).toBe(true);
    expect(shouldReuseExistingTabForAttempt(adapter({ requiresForegroundTab: true }), false)).toBe(false);
  });

  it('honors explicit retry tab reuse overrides', () => {
    expect(shouldReuseExistingTabForAttempt(adapter({ requiresForegroundTab: true }), false, {
      reuseExistingTab: true,
    })).toBe(true);
    expect(shouldReuseExistingTabForAttempt(adapter(), false, {
      reuseExistingTab: false,
    })).toBe(false);
  });

  it('preserves the final chunk flow trace on aggregated preview results', () => {
    const result = buildFinalChunkResult('x', false, true, undefined, {
      mode: 'preview',
      attempt: 'default',
      submitReached: false,
      lastCompletedStep: 'wait-submit',
    });

    expect(result.flow).toMatchObject({
      mode: 'preview',
      attempt: 'default',
      submitReached: false,
      lastCompletedStep: 'wait-submit',
    });
  });

  it('adds a fallback flow trace when a successful chunk omitted it', () => {
    const result = buildFinalChunkResult('x', false, true);

    expect(result.flow).toMatchObject({
      mode: 'preview',
      submitReached: false,
      lastCompletedStep: 'preview-flow',
    });
  });

  it('expects media only on the first chunk of a split post', () => {
    const image = {
      name: 'photo.png',
      type: 'image/png',
      data: 'AA==',
    };
    expect(buildVerifyExpectationForChunk(['first', 'second'], 'first second', [image], 0)).toMatchObject({
      text: 'first',
      hasImages: true,
    });
    expect(buildVerifyExpectationForChunk(['first', 'second'], 'first second', [image], 1)).toMatchObject({
      text: 'second',
      hasImages: false,
    });
  });
});
