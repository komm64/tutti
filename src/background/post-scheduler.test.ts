import { describe, expect, it } from 'vitest';
import type { PlatformId, PostResultMessage } from '../messages';
import { runPostScheduler } from './post-scheduler';

describe('runPostScheduler', () => {
  it('runs foreground preview work serially while background-safe work proceeds in parallel', async () => {
    const platforms: PlatformId[] = ['x', 'bluesky', 'mastodon', 'misskey', 'tumblr'];
    const started: string[] = [];
    const completed: PlatformId[] = [];
    let activeForeground = 0;
    let activeBackground = 0;
    let maxForeground = 0;
    let maxBackground = 0;
    let releaseX!: () => void;
    const xStarted = deferred<void>();
    const xReleased = new Promise<void>((resolve) => {
      releaseX = resolve;
    });

    const resultsPromise = runPostScheduler({
      platforms,
      autoPost: false,
      post: async (platform, execution): Promise<PostResultMessage> => {
        started.push(`${execution.lane}:${platform}`);
        if (execution.forceForeground) {
          activeForeground += 1;
          maxForeground = Math.max(maxForeground, activeForeground);
        } else {
          activeBackground += 1;
          maxBackground = Math.max(maxBackground, activeBackground);
        }

        if (platform === 'x') {
          xStarted.resolve();
          await xReleased;
        } else {
          await sleep(5);
        }

        if (execution.forceForeground) activeForeground -= 1;
        else activeBackground -= 1;
        return { type: 'POST_RESULT', platform, success: true };
      },
      onResult: (result) => completed.push(result.platform),
    });

    await xStarted.promise;
    await waitUntil(() => started.some((event) => event === 'background:bluesky'));
    expect(started).not.toContain('foreground:tumblr');

    releaseX();
    const results = await resultsPromise;

    expect(maxForeground).toBe(1);
    expect(maxBackground).toBe(3);
    expect(results.map((result) => result.platform).sort()).toEqual([...platforms].sort());
    expect(completed.sort()).toEqual([...platforms].sort());
  });

  it('keeps real posts serialized', async () => {
    const platforms: PlatformId[] = ['x', 'bluesky', 'instagram'];
    let active = 0;
    let maxActive = 0;
    const forceForegroundFlags: boolean[] = [];

    await runPostScheduler({
      platforms,
      autoPost: true,
      post: async (platform, execution): Promise<PostResultMessage> => {
        forceForegroundFlags.push(execution.forceForeground);
        active += 1;
        maxActive = Math.max(maxActive, active);
        await sleep(5);
        active -= 1;
        return { type: 'POST_RESULT', platform, success: true };
      },
    });

    expect(maxActive).toBe(1);
    expect(forceForegroundFlags).toEqual([false, false, false]);
  });

  it('keeps interactive platforms in a throttled background lane for video previews', async () => {
    const seen = new Map<PlatformId, string>();
    let activeBackground = 0;
    let maxBackground = 0;

    await runPostScheduler({
      platforms: ['x', 'bluesky', 'tumblr', 'instagram'],
      autoPost: false,
      planOptions: { hasVideo: true },
      post: async (platform, execution): Promise<PostResultMessage> => {
        seen.set(platform, `${execution.lane}:${execution.forceForeground}`);
        if (!execution.forceForeground) {
          activeBackground += 1;
          maxBackground = Math.max(maxBackground, activeBackground);
          await sleep(5);
          activeBackground -= 1;
        }
        return { type: 'POST_RESULT', platform, success: true };
      },
    });

    expect(seen.get('instagram')).toBe('foreground:true');
    expect(seen.get('x')).toBe('background:false');
    expect(seen.get('tumblr')).toBe('background:false');
    expect(seen.get('bluesky')).toBe('background:false');
    expect(maxBackground).toBe(1);
  });
});

function deferred<T>(): { promise: Promise<T>; resolve: (value: T | PromiseLike<T>) => void } {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

async function waitUntil(predicate: () => boolean): Promise<void> {
  const startedAt = Date.now();
  while (!predicate()) {
    if (Date.now() - startedAt > 200) throw new Error('condition timed out');
    await sleep(1);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
