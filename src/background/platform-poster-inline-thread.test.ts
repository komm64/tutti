import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PostResultMessage, PostToPlatformMessage } from '../messages';

const mocks = vi.hoisted(() => ({
  openOrFocusTab: vi.fn(),
  sendPostMessageWhenReady: vi.fn(),
}));

vi.mock('./tab-management', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./tab-management')>();
  return {
    ...actual,
    openOrFocusTab: mocks.openOrFocusTab,
  };
});

vi.mock('./content-dispatch', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./content-dispatch')>();
  return {
    ...actual,
    sendPostMessageWhenReady: mocks.sendPostMessageWhenReady,
  };
});

vi.mock('../storage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../storage')>();
  return {
    ...actual,
    getLastSeenUsers: vi.fn(async () => ({})),
  };
});

import { createPlatformPoster } from './platform-poster';

describe('X inline thread orchestration', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.openOrFocusTab.mockResolvedValue({
      tab: {
        id: 42,
        url: 'https://x.com/compose/post',
        status: 'complete',
      },
      wasCreated: true,
    });
    mocks.sendPostMessageWhenReady.mockResolvedValue({
      type: 'POST_RESULT',
      platform: 'x',
      success: true,
      url: 'https://x.com/alice/status/123456789',
    } satisfies PostResultMessage);

    Object.assign((globalThis as typeof globalThis & { browser: Record<string, unknown> }).browser, {
      tabs: {
        get: vi.fn(async () => ({
          id: 42,
          url: 'https://x.com/compose/post',
          status: 'complete',
        })),
      },
    });
  });

  it('dispatches all real-post chunks to one compose request', async () => {
    const poster = createPlatformPoster({
      openedTabs: {
        record: vi.fn(),
        forget: vi.fn(),
      },
    });
    const text = Array.from({ length: 120 }, (_, index) => `word${index}`).join(' ');

    const result = await poster.postToPlatform('x', text, undefined, undefined, undefined, true);

    expect(result).toMatchObject({
      platform: 'x',
      success: true,
      confirmed: true,
      url: 'https://x.com/alice/status/123456789',
    });
    expect(mocks.openOrFocusTab).toHaveBeenCalledTimes(1);
    expect(mocks.sendPostMessageWhenReady).toHaveBeenCalledTimes(1);

    const [, message] = mocks.sendPostMessageWhenReady.mock.calls[0] as [
      number,
      PostToPlatformMessage,
    ];
    expect(message.platform).toBe('x');
    expect(message.dryRun).toBe(false);
    expect(message.textChunks?.length).toBeGreaterThan(1);
    expect(message.text).toBe(message.textChunks?.[0]);
    expect(message.textChunks?.join('')).toContain('word119');
  });

  it('uses captured post URLs when the legacy sequential mode is selected', async () => {
    mocks.sendPostMessageWhenReady
      .mockResolvedValueOnce({
        type: 'POST_RESULT',
        platform: 'x',
        success: true,
        url: 'https://x.com/alice/status/111',
      } satisfies PostResultMessage)
      .mockResolvedValueOnce({
        type: 'POST_RESULT',
        platform: 'x',
        success: true,
        url: 'https://x.com/alice/status/222',
      } satisfies PostResultMessage);
    const poster = createPlatformPoster({
      openedTabs: {
        record: vi.fn(),
        forget: vi.fn(),
      },
    });
    const text = 'a'.repeat(400);

    const resultPromise = poster.postToPlatform(
      'x',
      text,
      undefined,
      undefined,
      undefined,
      true,
      { xThreadPostingMode: 'sequential' },
    );
    const result = await resultPromise;

    expect(result).toMatchObject({
      platform: 'x',
      success: true,
      confirmed: true,
      url: 'https://x.com/alice/status/222',
    });
    expect(mocks.openOrFocusTab).toHaveBeenCalledTimes(2);
    expect(mocks.openOrFocusTab.mock.calls[1]?.[0]).toBe(
      'https://x.com/intent/post?in_reply_to=111',
    );
    expect(mocks.sendPostMessageWhenReady).toHaveBeenCalledTimes(2);
    for (const [, message] of mocks.sendPostMessageWhenReady.mock.calls as Array<
      [number, PostToPlatformMessage]
    >) {
      expect(message.textChunks).toBeUndefined();
    }
  });
});
