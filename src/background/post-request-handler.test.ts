import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PostRequestMessage, PostResultMessage } from '../messages';
import { createPostRequestHandler } from './post-request-handler';
import { createPostingStateManager } from './posting-state';
import { createSubmissionGuard } from './submission-guard';

describe('post request settings boundary', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fixes the selected X thread mode at request start and forwards it', async () => {
    vi.stubGlobal('browser', {
      storage: {
        sync: {
          get: vi.fn(async () => ({
            settings: {
              autoPost: false,
              xThreadPostingMode: 'sequential',
            },
          })),
        },
      },
      action: {
        setBadgeText: vi.fn(async () => undefined),
      },
    });
    const postToPlatform = vi.fn(async (): Promise<PostResultMessage> => ({
      type: 'POST_RESULT',
      platform: 'x',
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
      platformPoster: { postToPlatform },
      appendBackgroundLog: vi.fn(),
      sendRuntimeMessage: vi.fn(async () => undefined),
    });
    const request: PostRequestMessage = {
      type: 'POST_REQUEST',
      requestId: 'request-1',
      intent: 'new',
      text: 'a'.repeat(400),
      platforms: ['x'],
    };

    const results = await handler(request);

    expect(postToPlatform).toHaveBeenCalledOnce();
    const call = postToPlatform.mock.calls[0] as unknown as unknown[];
    expect(call[6]).toEqual({
      forceForeground: true,
      xThreadPostingMode: 'sequential',
    });
    expect(results[0]?.implementation).toEqual({
      revision: 1,
      path: 'legacy',
    });
  });
});
