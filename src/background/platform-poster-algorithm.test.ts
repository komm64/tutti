import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlatformId, PostResultMessage } from '../messages';

const mocks = vi.hoisted(() => {
  const calls = {
    next: vi.fn(),
    legacy: vi.fn(),
  };
  return {
    calls,
    createNextPostOrchestrator: vi.fn(() => ({
      postToPlatform: calls.next,
    })),
    createLegacyPostOrchestrator: vi.fn(() => ({
      postToPlatform: calls.legacy,
    })),
  };
});

vi.mock('./post-orchestrator', () => ({
  createNextPostOrchestrator: mocks.createNextPostOrchestrator,
}));

vi.mock('./legacy-post-orchestrator', () => ({
  createLegacyPostOrchestrator: mocks.createLegacyPostOrchestrator,
}));

import { createPlatformPoster } from './platform-poster';

describe('root posting algorithm boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const algorithm of ['next', 'legacy'] as const) {
      mocks.calls[algorithm].mockImplementation(async (
        platform: PlatformId,
      ): Promise<PostResultMessage> => ({
        type: 'POST_RESULT',
        platform,
        success: true,
        preview: true,
      }));
    }
  });

  it('creates immutable next and legacy orchestrator profiles', () => {
    createPoster();

    expect(mocks.createNextPostOrchestrator).toHaveBeenCalledOnce();
    expect(mocks.createNextPostOrchestrator).toHaveBeenCalledWith(
      expect.any(Object),
    );
    expect(mocks.createLegacyPostOrchestrator).toHaveBeenCalledOnce();
    expect(mocks.createLegacyPostOrchestrator).toHaveBeenCalledWith(
      expect.any(Object),
    );
  });

  it('routes every platform through the selected root profile', async () => {
    const poster = createPoster();
    const legacyPoster = poster.forAlgorithm('legacy');
    const nextPoster = poster.forAlgorithm('next');

    await legacyPoster.postToPlatform(
      'mastodon',
      'legacy body',
      undefined,
      undefined,
      undefined,
      false,
    );
    await nextPoster.postToPlatform(
      'youtube',
      'next body',
      undefined,
      undefined,
      undefined,
      false,
    );

    expect(mocks.calls.legacy).toHaveBeenCalledTimes(1);
    expect(mocks.calls.legacy.mock.calls[0]?.[0]).toBe('mastodon');
    expect(mocks.calls.next).toHaveBeenCalledTimes(1);
    expect(mocks.calls.next.mock.calls[0]?.[0]).toBe('youtube');
  });

  it('defaults missing settings to the new root profile', async () => {
    const poster = createPoster();

    await poster.postToPlatform('bluesky', 'default body');

    expect(mocks.calls.next).toHaveBeenCalledTimes(1);
    expect(mocks.calls.legacy).not.toHaveBeenCalled();
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
