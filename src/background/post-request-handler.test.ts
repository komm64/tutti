import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PostRequestMessage, PostResultMessage } from '../messages';
import { POST_MESSAGE_RESPONSE_TIMEOUT_MS } from './content-dispatch';
import { createPostRequestHandler } from './post-request-handler';
import { createPostingStateManager } from './posting-state';
import { createSubmissionGuard } from './submission-guard';

vi.mock('./media-preprocess', () => ({
  maybeCompressVideoForBudget: vi.fn(async (
    _platforms: unknown,
    images: PostRequestMessage['images'],
  ) => images),
}));

vi.mock('./history-recorder', () => ({
  releasePostAttachments: vi.fn(async () => undefined),
  recordHistoryEntry: vi.fn(async () => undefined),
}));

describe('post request settings boundary', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('ignores a retired stored legacy selector and uses the current implementation', async () => {
    vi.stubGlobal('browser', {
      storage: {
        sync: {
          get: vi.fn(async () => ({
            settings: {
              autoPost: false,
              postingAlgorithm: 'legacy',
            },
          })),
        },
      },
      action: {
        setBadgeText: vi.fn(async () => undefined),
      },
    });
    const postToPlatform = vi.fn(async (
      platform: PostResultMessage['platform'],
    ): Promise<PostResultMessage> => ({
      type: 'POST_RESULT',
      platform,
      success: true,
      preview: true,
    }));
    const handler = createPostRequestHandler({
      submissionGuard: createSubmissionGuard(),
      openedTabs: {
        clear: vi.fn(),
        record: vi.fn(),
        forget: vi.fn(),
        cleanup: vi.fn(async () => undefined),
      },
      postingState: createPostingStateManager(),
      platformPoster: {
        postToPlatform,
      },
      appendBackgroundLog: vi.fn(),
      sendRuntimeMessage: vi.fn(async () => undefined),
    });
    const request: PostRequestMessage = {
      type: 'POST_REQUEST',
      requestId: 'request-1',
      intent: 'new',
      text: 'a'.repeat(400),
      platforms: ['x', 'bluesky'],
    };

    const results = await handler(request);

    expect(postToPlatform).toHaveBeenCalledTimes(2);
    expect(results).toHaveLength(2);
    expect(results.every((result) => (
      result.implementation?.revision === 1
      && result.implementation.path === 'next'
    ))).toBe(true);
  });

  it('adds local stage timings only to the next implementation', async () => {
    vi.stubGlobal('browser', {
      storage: {
        sync: {
          get: vi.fn(async () => ({
            settings: {
              autoPost: false,
              postingAlgorithm: 'next',
            },
          })),
        },
      },
      action: {
        setBadgeText: vi.fn(async () => undefined),
      },
    });
    const postToPlatform = vi.fn(async (
      platform: PostResultMessage['platform'],
    ): Promise<PostResultMessage> => ({
      type: 'POST_RESULT',
      platform,
      success: true,
      preview: true,
      flow: {
        submitReached: false,
        stageTimings: [{
          step: 'inject-text',
          durationMs: 12,
          outcome: 'completed',
        }],
      },
    }));
    const handler = createPostRequestHandler({
      submissionGuard: createSubmissionGuard(),
      openedTabs: {
        clear: vi.fn(),
        record: vi.fn(),
        forget: vi.fn(),
        cleanup: vi.fn(async () => undefined),
      },
      postingState: createPostingStateManager(),
      platformPoster: {
        postToPlatform,
      },
      appendBackgroundLog: vi.fn(),
      sendRuntimeMessage: vi.fn(async () => undefined),
    });

    const [result] = await handler({
      type: 'POST_REQUEST',
      requestId: 'request-next-timing',
      intent: 'new',
      text: 'timed preview',
      platforms: ['x'],
    });

    expect(result?.flow).toMatchObject({
      totalDurationMs: expect.any(Number),
      stageTimings: [
        { step: 'inject-text', durationMs: 12 },
        { step: 'scheduler-queue:foreground', durationMs: expect.any(Number) },
        { step: 'platform-total', durationMs: expect.any(Number) },
      ],
    });
  });

  it('isolates a channel-close failure and continues later foreground platforms', async () => {
    vi.stubGlobal('browser', {
      storage: {
        sync: {
          get: vi.fn(async () => ({
            settings: { autoPost: true, postingAlgorithm: 'next' },
          })),
        },
        local: {
          get: vi.fn(async () => ({})),
          set: vi.fn(async () => undefined),
        },
      },
      windows: {
        getAll: vi.fn(async () => []),
        create: vi.fn(async () => ({ id: 41, tabs: [{ id: 410, windowId: 41 }] })),
        update: vi.fn(async () => undefined),
        get: vi.fn(async () => ({ id: 41, tabs: [{ id: 410, windowId: 41 }] })),
        remove: vi.fn(async () => undefined),
        onRemoved: { addListener: vi.fn(), removeListener: vi.fn() },
        onFocusChanged: { addListener: vi.fn(), removeListener: vi.fn() },
      },
      tabs: {
        query: vi.fn(async () => []),
        remove: vi.fn(async () => undefined),
      },
      action: {
        setBadgeText: vi.fn(async () => undefined),
        setBadgeBackgroundColor: vi.fn(async () => undefined),
      },
      notifications: { create: vi.fn(async () => undefined) },
      runtime: { getURL: vi.fn((path: string) => `chrome-extension://test${path}`) },
      i18n: { getMessage: vi.fn((key: string) => key) },
    });
    const started: PostResultMessage['platform'][] = [];
    const postToPlatform = vi.fn(async (
      platform: PostResultMessage['platform'],
    ): Promise<PostResultMessage> => {
      started.push(platform);
      if (platform === 'threads') {
        throw new Error(
          'A listener indicated an asynchronous response but the message channel closed',
        );
      }
      return {
        type: 'POST_RESULT',
        platform,
        success: true,
        confirmed: true,
        url: `https://example.test/${platform}/1`,
        flow: { submitReached: true },
      };
    });
    const progress: PostResultMessage[] = [];
    const handler = createPostRequestHandler({
      submissionGuard: createSubmissionGuard(),
      openedTabs: {
        clear: vi.fn(),
        record: vi.fn(),
        forget: vi.fn(),
        cleanup: vi.fn(async () => undefined),
      },
      postingState: createPostingStateManager(),
      platformPoster: {
        postToPlatform,
      },
      appendBackgroundLog: vi.fn(),
      sendRuntimeMessage: vi.fn(async (message: unknown) => {
        const result = (message as { result?: PostResultMessage }).result;
        if (result) progress.push(result);
      }),
    });

    const results = await handler({
      type: 'POST_REQUEST',
      requestId: 'request-isolate-channel-close',
      intent: 'new',
      text: 'four image regression',
      platforms: ['threads', 'tumblr', 'instagram'],
    });

    expect(started).toEqual(['threads', 'tumblr', 'instagram']);
    expect(results).toHaveLength(3);
    expect(results[0]).toMatchObject({
      platform: 'threads',
      success: false,
      uncertain: true,
      implementation: { path: 'next', revision: 1 },
      flow: { submitReached: true, failedStep: 'platform-exception' },
    });
    expect(results.slice(1).every((result) => result.success)).toBe(true);
    expect(progress.map((result) => result.platform)).toEqual([
      'threads',
      'tumblr',
      'instagram',
    ]);
  });

  it('times out the entire platform attempt and continues the serial lane', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('browser', {
      storage: {
        sync: {
          get: vi.fn(async () => ({
            settings: { autoPost: false, postingAlgorithm: 'next' },
          })),
        },
      },
      action: {
        setBadgeText: vi.fn(async () => undefined),
      },
    });
    const started: PostResultMessage['platform'][] = [];
    const postToPlatform = vi.fn((
      platform: PostResultMessage['platform'],
    ): Promise<PostResultMessage> => {
      started.push(platform);
      if (platform === 'tumblr') return new Promise(() => { /* never resolves */ });
      return Promise.resolve({
        type: 'POST_RESULT',
        platform,
        success: true,
        preview: true,
      });
    });
    const handler = createPostRequestHandler({
      submissionGuard: createSubmissionGuard(),
      openedTabs: {
        clear: vi.fn(),
        record: vi.fn(),
        forget: vi.fn(),
        cleanup: vi.fn(async () => undefined),
      },
      postingState: createPostingStateManager(),
      platformPoster: {
        postToPlatform,
      },
      appendBackgroundLog: vi.fn(),
      sendRuntimeMessage: vi.fn(async () => undefined),
    });

    const resultsPromise = handler({
      type: 'POST_REQUEST',
      requestId: 'request-platform-timeout',
      intent: 'new',
      text: 'bounded preview',
      platforms: ['tumblr', 'x'],
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(started).toEqual(['tumblr']);

    await vi.advanceTimersByTimeAsync(POST_MESSAGE_RESPONSE_TIMEOUT_MS);
    const results = await resultsPromise;

    expect(started).toEqual(['tumblr', 'x']);
    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({
      platform: 'tumblr',
      success: false,
      flow: { submitReached: false, failedStep: 'platform-timeout' },
      error: `tumblr post (1 chunk) timed out after ${POST_MESSAGE_RESPONSE_TIMEOUT_MS}ms`,
    });
    expect(results[1]).toMatchObject({ platform: 'x', success: true });
  });

  it('returns an uncertain result immediately when the posting window is closed', async () => {
    let removedListener: ((windowId: number) => void) | undefined;
    const createWindow = vi.fn(async () => ({
      id: 41,
      tabs: [{ id: 410, windowId: 41, url: 'about:blank' }],
    }));
    vi.stubGlobal('browser', {
      storage: {
        sync: {
          get: vi.fn(async () => ({
            settings: {
              autoPost: true,
              postingAlgorithm: 'next',
            },
          })),
        },
        local: {
          get: vi.fn(async () => ({})),
          set: vi.fn(async () => undefined),
        },
      },
      windows: {
        getAll: vi.fn(async () => [{
          id: 7,
          type: 'normal',
          focused: true,
          left: 0,
          top: 0,
          width: 1200,
          height: 800,
        }]),
        create: createWindow,
        update: vi.fn(async () => undefined),
        get: vi.fn(async () => undefined),
        remove: vi.fn(async () => undefined),
        onRemoved: {
          addListener: vi.fn((listener: (windowId: number) => void) => {
            removedListener = listener;
          }),
          removeListener: vi.fn(),
        },
        onFocusChanged: {
          addListener: vi.fn(),
          removeListener: vi.fn(),
        },
      },
      tabs: {
        query: vi.fn(async () => []),
        remove: vi.fn(async () => undefined),
      },
      action: {
        setBadgeText: vi.fn(async () => undefined),
        setBadgeBackgroundColor: vi.fn(async () => undefined),
      },
      notifications: {
        create: vi.fn(async () => undefined),
      },
      runtime: {
        getURL: vi.fn((path: string) => `chrome-extension://test/${path}`),
      },
      i18n: {
        getMessage: vi.fn((key: string) => key),
      },
    });
    const postToPlatform = vi.fn(() => new Promise<PostResultMessage>(() => {}));
    const handler = createPostRequestHandler({
      submissionGuard: createSubmissionGuard(),
      openedTabs: {
        clear: vi.fn(),
        record: vi.fn(),
        forget: vi.fn(),
        cleanup: vi.fn(async () => undefined),
      },
      postingState: createPostingStateManager(),
      platformPoster: {
        postToPlatform,
      },
      appendBackgroundLog: vi.fn(),
      sendRuntimeMessage: vi.fn(async () => undefined),
    });

    const resultPromise = handler({
      type: 'POST_REQUEST',
      requestId: 'request-window-closed',
      intent: 'new',
      text: 'posting window closure test',
      platforms: ['x'],
    });
    await vi.waitFor(() => expect(createWindow).toHaveBeenCalledTimes(1));
    removedListener?.(41);
    const [result] = await resultPromise;

    expect(result).toMatchObject({
      platform: 'x',
      success: false,
      uncertain: true,
      userAction: 'check-post-before-retry',
      flow: {
        submitReached: true,
        failedStep: 'posting-window-closed',
      },
    });
    expect(postToPlatform).toHaveBeenCalledWith(
      'x',
      'posting window closure test',
      undefined,
      undefined,
      undefined,
      true,
      expect.objectContaining({
        forceForeground: true,
        postWindowId: 41,
      }),
    );
  });

  it('creates and keeps the video posting window focused before DOM dispatch', async () => {
    const events: string[] = [];
    const createWindow = vi.fn(async (options: Browser.windows.CreateData) => {
      events.push('window:create');
      return {
        id: 51,
        focused: true,
        tabs: [{ id: 510, windowId: 51, url: String(options.url) }],
      };
    });
    const updateWindow = vi.fn(async () => undefined);
    const clearNotification = vi.fn(async () => true);
    vi.stubGlobal('browser', {
      storage: {
        sync: {
          get: vi.fn(async () => ({
            settings: {
              autoPost: true,
              postingAlgorithm: 'next',
            },
          })),
        },
        local: {
          get: vi.fn(async () => ({})),
          set: vi.fn(async () => undefined),
        },
      },
      windows: {
        getAll: vi.fn(async () => [{
          id: 7,
          type: 'normal',
          focused: true,
          left: 0,
          top: 0,
          width: 1200,
          height: 800,
        }]),
        create: createWindow,
        update: updateWindow,
        get: vi.fn(async () => ({
          id: 51,
          focused: true,
          tabs: [{ id: 510, windowId: 51, url: 'chrome-extension://test/posting-wait.html' }],
        })),
        remove: vi.fn(async () => undefined),
        onRemoved: {
          addListener: vi.fn(),
          removeListener: vi.fn(),
        },
        onFocusChanged: {
          addListener: vi.fn(),
          removeListener: vi.fn(),
        },
      },
      tabs: {
        query: vi.fn(async () => []),
        remove: vi.fn(async () => undefined),
      },
      action: {
        setBadgeText: vi.fn(async () => undefined),
        setBadgeBackgroundColor: vi.fn(async () => undefined),
      },
      notifications: {
        create: vi.fn(async () => undefined),
        clear: clearNotification,
      },
      runtime: {
        getURL: vi.fn((path: string) => `chrome-extension://test${path}`),
      },
      i18n: {
        getMessage: vi.fn((key: string) => key),
      },
    });
    const postToPlatform = vi.fn(async (
      platform: PostResultMessage['platform'],
      ..._args: unknown[]
    ): Promise<PostResultMessage> => {
      events.push(`post:${platform}`);
      return {
        type: 'POST_RESULT',
        platform,
        success: true,
        confirmed: true,
        url: 'https://x.com/test/status/1',
        flow: { submitReached: true },
      };
    });
    const handler = createPostRequestHandler({
      submissionGuard: createSubmissionGuard(),
      openedTabs: {
        clear: vi.fn(),
        record: vi.fn(),
        forget: vi.fn(),
        cleanup: vi.fn(async () => undefined),
      },
      postingState: createPostingStateManager(),
      platformPoster: {
        postToPlatform,
      },
      appendBackgroundLog: vi.fn(),
      sendRuntimeMessage: vi.fn(async () => undefined),
    });

    await handler({
      type: 'POST_REQUEST',
      requestId: 'request-video-foreground',
      intent: 'new',
      text: 'video foreground test',
      platforms: ['x'],
      images: [{
        name: 'clip.mp4',
        type: 'video/mp4',
        data: 'AA==',
        durationS: 5,
      }],
    });

    expect(events).toEqual(['window:create', 'post:x']);
    expect(createWindow).toHaveBeenCalledWith({
      url: 'chrome-extension://test/posting-wait.html',
      type: 'normal',
      focused: true,
      state: 'maximized',
    });
    expect(updateWindow).toHaveBeenCalledWith(51, { state: 'maximized' });
    expect(updateWindow).not.toHaveBeenCalledWith(7, { focused: true });
    expect(clearNotification).toHaveBeenCalled();
    expect(postToPlatform).toHaveBeenCalledWith(
      'x',
      'video foreground test',
      expect.arrayContaining([expect.objectContaining({ type: 'video/mp4' })]),
      undefined,
      undefined,
      true,
      expect.objectContaining({
        postWindowId: 51,
        postWindowFocusReturnId: undefined,
      }),
    );
  });
});
