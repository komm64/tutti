import { describe, expect, it } from 'vitest';
import { mastodonAdapter } from '../adapters/mastodon';
import { threadsAdapter } from '../adapters/threads';
import type { PlatformAdapter } from '../adapters/types';
import {
  buildDomPostAttempts,
  resolvePreSubmitLoadOptions,
  shouldOpenActive,
  shouldRetryPostAttempt,
  shouldReuseExistingTabForAttempt,
} from './dom-attempt-policy';

function adapter(overrides: Partial<PlatformAdapter> = {}): PlatformAdapter {
  return {
    id: 'threads',
    name: 'Threads',
    charLimit: 500,
    popupOrder: 1,
    defaultSelected: true,
    matchUrl: (url) => url.startsWith('https://www.threads.com/'),
    getComposeUrl: (text) => (
      `https://www.threads.com/intent/post?text=${encodeURIComponent(text)}`
    ),
    prefillsViaUrl: true,
    imageConstraints: { maxBytesPerImage: 8 * 1024 * 1024, maxImages: 10 },
    kinds: ['text', 'image'],
    ...overrides,
  };
}

describe('DOM posting attempt policy', () => {
  it('derives pre-submit load behavior from adapter policy', () => {
    expect(resolvePreSubmitLoadOptions(mastodonAdapter)).toEqual({
      loadRetries: 1,
      relaxedComposeUrlReady: true,
    });
    expect(resolvePreSubmitLoadOptions(threadsAdapter)).toBeUndefined();
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

  it('keeps foreground-only SNS retries shorter', () => {
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

  it('uses the preview delay and can force the first attempt foreground', () => {
    expect(buildDomPostAttempts(adapter(), false)[1]).toMatchObject({
      label: 'fresh foreground compose',
      delayBeforeMs: 250,
    });
    expect(buildDomPostAttempts(adapter(), false, true)[0]).toEqual({
      label: 'default',
      forceActive: true,
    });
  });

  it('derives foreground policy from post mode and platform requirements', () => {
    expect(shouldOpenActive(adapter(), false, undefined, true)).toBe(true);
    expect(shouldOpenActive(adapter(), true, undefined, false)).toBe(false);
    expect(
      shouldOpenActive(adapter({ requiresForegroundTab: true }), true, undefined, false),
    ).toBe(true);
    expect(shouldOpenActive(adapter(), true, undefined, false, true)).toBe(true);
  });

  it('reuses only safe background preview tabs unless explicitly overridden', () => {
    expect(shouldReuseExistingTabForAttempt(adapter(), false)).toBe(true);
    expect(
      shouldReuseExistingTabForAttempt(adapter({ requiresForegroundTab: true }), false),
    ).toBe(false);
    expect(shouldReuseExistingTabForAttempt(adapter(), false, {}, true)).toBe(false);
    expect(shouldReuseExistingTabForAttempt(
      adapter({ requiresForegroundTab: true }),
      false,
      { reuseExistingTab: true },
    )).toBe(true);
    expect(shouldReuseExistingTabForAttempt(
      adapter(),
      false,
      { reuseExistingTab: false },
    )).toBe(false);
  });

  it('stops real-post retries after submit but preserves safe retries', () => {
    expect(shouldRetryPostAttempt(true, { submitReached: true })).toBe(false);
    expect(shouldRetryPostAttempt(true, { submitReached: false })).toBe(true);
    expect(shouldRetryPostAttempt(true)).toBe(true);
    expect(shouldRetryPostAttempt(false, { submitReached: true })).toBe(true);
  });
});
