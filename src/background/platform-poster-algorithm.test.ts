import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlatformId, PostResultMessage } from '../messages';

const mocks = vi.hoisted(() => ({
  postToPlatform: vi.fn(),
  createNextPostOrchestrator: vi.fn(() => ({
    postToPlatform: mocks.postToPlatform,
  })),
}));

vi.mock('./post-orchestrator', () => ({
  createNextPostOrchestrator: mocks.createNextPostOrchestrator,
}));

import { createPlatformPoster } from './platform-poster';

describe('root posting orchestrator boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.postToPlatform.mockImplementation(async (
      platform: PlatformId,
    ): Promise<PostResultMessage> => ({
      type: 'POST_RESULT',
      platform,
      success: true,
      preview: true,
    }));
  });

  it('creates only the current orchestrator', () => {
    createPoster();

    expect(mocks.createNextPostOrchestrator).toHaveBeenCalledOnce();
    expect(mocks.createNextPostOrchestrator).toHaveBeenCalledWith(
      expect.any(Object),
    );
  });

  it('routes every platform through the current orchestrator', async () => {
    const poster = createPoster();

    await poster.postToPlatform('mastodon', 'body');
    await poster.postToPlatform('youtube', 'video body');

    expect(mocks.postToPlatform).toHaveBeenCalledTimes(2);
    expect(mocks.postToPlatform.mock.calls.map((call) => call[0])).toEqual([
      'mastodon',
      'youtube',
    ]);
  });
});

function createPoster() {
  return createPlatformPoster({
    openedTabs: {
      record: vi.fn(),
      forget: vi.fn(),
    },
  });
}
