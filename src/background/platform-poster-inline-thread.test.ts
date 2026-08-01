import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiPostResult } from '../api/types';
import type {
  ImageAttachment,
  PlatformId,
  PostResultMessage,
  PostToPlatformMessage,
} from '../messages';

const mocks = vi.hoisted(() => ({
  attachVerifyResult: vi.fn(async () => undefined),
  openOrFocusTab: vi.fn(),
  sendPostMessageWhenReady: vi.fn(),
  tryApiThreadPath: vi.fn<(
    platform: PlatformId,
    chunks: string[],
    images?: ImageAttachment[],
  ) => Promise<ApiPostResult | 'no-credentials'>>(
    async () => 'no-credentials',
  ),
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

vi.mock('./platform-strategies', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./platform-strategies')>();
  return {
    ...actual,
    tryApiThreadPath: mocks.tryApiThreadPath,
  };
});

vi.mock('./post-confirmation', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./post-confirmation')>();
  return {
    ...actual,
    attachVerifyResult: mocks.attachVerifyResult,
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
    mocks.tryApiThreadPath.mockResolvedValue('no-credentials');
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
      storage: {
        local: {
          get: vi.fn(async () => ({})),
        },
      },
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
  }, 10_000);

  it('uses captured post URLs when the legacy sequential mode is selected', async () => {
    vi.useFakeTimers();
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
    const legacyPoster = poster.forAlgorithm('legacy');
    const text = 'a'.repeat(400);

    const resultPromise = legacyPoster.postToPlatform(
      'x',
      text,
      undefined,
      undefined,
      undefined,
      true,
    );
    await vi.runAllTimersAsync();
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

  it('posts real X video threads sequentially after each URL is confirmed', async () => {
    vi.useFakeTimers();
    mocks.sendPostMessageWhenReady
      .mockResolvedValueOnce({
        type: 'POST_RESULT',
        platform: 'x',
        success: true,
        url: 'https://x.com/alice/status/333',
      } satisfies PostResultMessage)
      .mockResolvedValueOnce({
        type: 'POST_RESULT',
        platform: 'x',
        success: true,
        url: 'https://x.com/alice/status/444',
      } satisfies PostResultMessage);
    const poster = createPlatformPoster({
      openedTabs: {
        record: vi.fn(),
        forget: vi.fn(),
      },
    });

    const resultPromise = poster.postToPlatform(
      'x',
      'a'.repeat(400),
      [{
        name: 'thread.mp4',
        type: 'video/mp4',
        data: 'AA==',
        bytes: 1,
        durationS: 1,
      }],
      undefined,
      undefined,
      true,
    );
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result).toMatchObject({
      platform: 'x',
      success: true,
      confirmed: true,
      url: 'https://x.com/alice/status/444',
      mediaUrl: 'https://x.com/alice/status/333',
    });
    expect(mocks.openOrFocusTab).toHaveBeenCalledTimes(2);
    expect(mocks.openOrFocusTab.mock.calls[1]?.[0]).toBe(
      'https://x.com/intent/post?in_reply_to=333',
    );
    expect(mocks.sendPostMessageWhenReady).toHaveBeenCalledTimes(2);
    const firstMessage = mocks.sendPostMessageWhenReady.mock.calls[0]?.[1] as PostToPlatformMessage;
    const secondMessage = mocks.sendPostMessageWhenReady.mock.calls[1]?.[1] as PostToPlatformMessage;
    expect(firstMessage.textChunks).toBeUndefined();
    expect(firstMessage.images).toHaveLength(1);
    expect(secondMessage.textChunks).toBeUndefined();
    expect(secondMessage.images).toBeUndefined();
    expect(mocks.attachVerifyResult).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'https://x.com/alice/status/444',
        mediaUrl: 'https://x.com/alice/status/333',
      }),
      'x',
      'https://x.com/alice/status/333',
      [expect.any(String)],
      expect.any(String),
      expect.any(Array),
    );
  });
});

describe('Bluesky inline thread orchestration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.tryApiThreadPath.mockResolvedValue({
      success: true,
      postUrl: 'https://bsky.app/profile/alice.test/post/final',
    });
  });

  it('uses one API thread operation without opening a compose tab', async () => {
    const poster = createPlatformPoster({
      openedTabs: {
        record: vi.fn(),
        forget: vi.fn(),
      },
    });
    const text = 'a'.repeat(400);

    const result = await poster.postToPlatform(
      'bluesky',
      text,
      undefined,
      undefined,
      undefined,
      true,
    );

    expect(result).toMatchObject({
      platform: 'bluesky',
      success: true,
      confirmed: true,
      url: 'https://bsky.app/profile/alice.test/post/final',
    });
    expect(mocks.tryApiThreadPath).toHaveBeenCalledOnce();
    const [, chunks] = mocks.tryApiThreadPath.mock.calls[0]!;
    expect(chunks.length).toBeGreaterThan(1);
    expect(mocks.openOrFocusTab).not.toHaveBeenCalled();
    expect(mocks.sendPostMessageWhenReady).not.toHaveBeenCalled();
    expect(mocks.attachVerifyResult).toHaveBeenCalledOnce();
  });

  it('does not fall back to DOM after a partially posted API thread', async () => {
    mocks.tryApiThreadPath.mockResolvedValue({
      success: false,
      uncertain: true,
      postUrl: 'https://bsky.app/profile/alice.test/post/root',
      error: 'chunk 2/2 failed',
    });
    const poster = createPlatformPoster({
      openedTabs: {
        record: vi.fn(),
        forget: vi.fn(),
      },
    });

    const result = await poster.postToPlatform(
      'bluesky',
      'a'.repeat(400),
      undefined,
      undefined,
      undefined,
      true,
    );

    expect(result).toMatchObject({
      platform: 'bluesky',
      success: false,
      uncertain: true,
      userAction: 'check-post-before-retry',
    });
    expect(mocks.openOrFocusTab).not.toHaveBeenCalled();
    expect(mocks.sendPostMessageWhenReady).not.toHaveBeenCalled();
  });
});
