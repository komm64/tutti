import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PostRequestMessage, PostResultMessage } from '../messages';
import { createPostRequestHandler } from './post-request-handler';
import { createPostingStateManager } from './posting-state';
import { createSubmissionGuard } from './submission-guard';

describe('post request settings boundary', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fixes the selected posting algorithm at request start and forwards it', async () => {
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
    const forAlgorithm = vi.fn(() => ({ postToPlatform }));
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
        forAlgorithm,
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

    expect(forAlgorithm).toHaveBeenCalledTimes(1);
    expect(forAlgorithm).toHaveBeenCalledWith('legacy');
    expect(postToPlatform).toHaveBeenCalledTimes(2);
    expect(results).toHaveLength(2);
    expect(results.every((result) => (
      result.implementation?.revision === 1
      && result.implementation.path === 'legacy'
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
        forAlgorithm: vi.fn(() => ({ postToPlatform })),
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
});
