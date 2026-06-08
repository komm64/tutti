import { describe, expect, it } from 'vitest';
import type { PlatformId, PostResultMessage } from '../messages';
import { runPostWorkerPool } from './post-worker-pool';

describe('runPostWorkerPool', () => {
  it('runs posts with a concurrency cap and reports each result', async () => {
    const platforms: PlatformId[] = ['x', 'bluesky', 'threads', 'mastodon'];
    const completed: PlatformId[] = [];
    let active = 0;
    let maxActive = 0;

    const results = await runPostWorkerPool({
      platforms,
      concurrency: 2,
      post: async (platform): Promise<PostResultMessage> => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await sleep(5);
        active -= 1;
        return { type: 'POST_RESULT', platform, success: true };
      },
      onResult: (result) => completed.push(result.platform),
    });

    expect(maxActive).toBeLessThanOrEqual(2);
    expect(results.map((r) => r.platform).sort()).toEqual([...platforms].sort());
    expect(completed.sort()).toEqual([...platforms].sort());
  });

  it('returns no results when there is no work or no concurrency', async () => {
    await expect(runPostWorkerPool({
      platforms: ['x'],
      concurrency: 0,
      post: async () => ({ type: 'POST_RESULT', platform: 'x', success: true }),
    })).resolves.toEqual([]);
    await expect(runPostWorkerPool({
      platforms: [],
      concurrency: 3,
      post: async () => ({ type: 'POST_RESULT', platform: 'x', success: true }),
    })).resolves.toEqual([]);
  });
});

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
