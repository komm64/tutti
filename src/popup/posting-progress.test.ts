import { describe, expect, it } from 'vitest';
import {
  applyBackgroundState,
  applyProgressMessage,
  mergePlatformProgress,
  mergePostingRestoreState,
  nextCompressionEta,
  type PostingViewState,
} from './posting-progress';

describe('popup posting progress', () => {
  it('merges restored background state with streamed popup results', () => {
    const merged = mergePostingRestoreState({
      platforms: ['x', 'bluesky', 'threads'],
      pending: ['x', 'threads'],
      results: [{ type: 'POST_RESULT', platform: 'bluesky', success: true }],
    }, [
      { type: 'POST_RESULT', platform: 'x', success: true },
    ]);

    expect(merged.pendingPlatforms).toEqual(['threads']);
    expect(merged.results.map((result) => result.platform).sort()).toEqual(['bluesky', 'x']);
  });

  it('replaces existing platform progress and removes pending status', () => {
    const merged = mergePlatformProgress([
      { type: 'POST_RESULT', platform: 'x', success: false },
    ], ['x', 'threads'], {
      type: 'POST_RESULT',
      platform: 'x',
      success: true,
    });

    expect(merged.pendingPlatforms).toEqual(['threads']);
    expect(merged.results).toEqual([{ type: 'POST_RESULT', platform: 'x', success: true }]);
  });

  it('estimates compression ETA once transcode progress is meaningful', () => {
    expect(nextCompressionEta({ stage: 'load', progress: 0.2 }, null, 1000)).toEqual({
      startedAt: null,
      etaS: null,
    });
    expect(nextCompressionEta({ stage: 'transcode', progress: 0.01 }, null, 1000)).toEqual({
      startedAt: 1000,
      etaS: null,
    });
    expect(nextCompressionEta({ stage: 'transcode', progress: 0.25 }, 1000, 3000)).toEqual({
      startedAt: 1000,
      etaS: 6,
    });
  });

  it('applies retained background state to the popup view', () => {
    const current: PostingViewState = {
      posting: false,
      pendingPlatforms: [],
      lastResults: [{ type: 'POST_RESULT', platform: 'x', success: true }],
      compressionProgress: null,
      compressionStartedAt: null,
      compressionEtaS: null,
    };

    const next = applyBackgroundState({
      posting: true,
      postingState: {
        platforms: ['x', 'threads'],
        pending: ['threads'],
        results: [],
      },
      compression: { stage: 'transcode', progress: 0.2 },
    }, current, 5000);

    expect(next).toMatchObject({
      posting: true,
      pendingPlatforms: ['threads'],
      compressionStartedAt: 5000,
      compressionProgress: { stage: 'transcode', progress: 0.2 },
    });
    expect(next.lastResults).toEqual([{ type: 'POST_RESULT', platform: 'x', success: true }]);
  });

  it('applies streamed runtime progress messages', () => {
    const current: PostingViewState = {
      posting: true,
      pendingPlatforms: ['x'],
      lastResults: [],
      compressionProgress: { stage: 'transcode', progress: 0.5 },
      compressionStartedAt: 1000,
      compressionEtaS: 10,
    };

    const next = applyProgressMessage({
      type: 'PLATFORM_PROGRESS',
      result: { type: 'POST_RESULT', platform: 'x', success: true },
    }, current);

    expect(next).toMatchObject({
      pendingPlatforms: [],
      lastResults: [{ type: 'POST_RESULT', platform: 'x', success: true }],
      compressionProgress: null,
    });
  });
});
