import { describe, expect, it } from 'vitest';
import type { PlatformAdapter } from '../adapters/types';
import { buildDomPostAttempts, buildReplyOverrideUrl } from './platform-poster';

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

  it('does not build reply URLs outside X continuation chunks', () => {
    expect(buildReplyOverrideUrl('x', 0, 'https://x.com/alice/status/123456')).toBeUndefined();
    expect(buildReplyOverrideUrl('bluesky', 1, 'https://bsky.app/profile/alice/post/abc')).toBeUndefined();
    expect(buildReplyOverrideUrl('x', 1, 'https://x.com/home')).toBeUndefined();
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
});
