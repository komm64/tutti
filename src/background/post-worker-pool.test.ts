import { describe, expect, it } from 'vitest';
import type { PlatformId, PostResultMessage } from '../messages';
import { runPostWorkerPool } from './post-worker-pool';

describe('runPostWorkerPool', () => {
  it('runs posts with a concurrency cap and reports each result', async () => {
    const platforms: PlatformId[] = ['x', 'bluesky', 'threads', 'mastodon'];
    const completed: PlatformId[] = [];
    let active = 0;
    let maxActive = 0;
    const concurrencyReached = deferred<void>();
    const releasePosts = deferred<void>();

    const resultsPromise = runPostWorkerPool({
      platforms,
      concurrency: 2,
      post: async (platform): Promise<PostResultMessage> => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        if (active === 2) concurrencyReached.resolve();
        await releasePosts.promise;
        active -= 1;
        return { type: 'POST_RESULT', platform, success: true };
      },
      onResult: (result) => completed.push(result.platform),
    });

    await concurrencyReached.promise;
    expect(active).toBe(2);
    releasePosts.resolve();
    const results = await resultsPromise;

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

function deferred<T>(): { promise: Promise<T>; resolve: (value: T | PromiseLike<T>) => void } {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
