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
    const backgroundStarted = deferred<void>();
    const releaseBackground = deferred<void>();
    let backgroundStartedCount = 0;
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
        } else if (!execution.forceForeground) {
          backgroundStartedCount += 1;
          if (backgroundStartedCount === 3) backgroundStarted.resolve();
          await releaseBackground.promise;
        }

        if (execution.forceForeground) activeForeground -= 1;
        else activeBackground -= 1;
        return { type: 'POST_RESULT', platform, success: true };
      },
      onResult: (result) => completed.push(result.platform),
    });

    await xStarted.promise;
    await backgroundStarted.promise;
    expect(started).not.toContain('foreground:tumblr');

    releaseBackground.resolve();
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
        active -= 1;
        return { type: 'POST_RESULT', platform, success: true };
      },
    });

    expect(maxActive).toBe(1);
    expect(forceForegroundFlags).toEqual([false, false, false]);
  });

  it('serializes video previews in the foreground lane', async () => {
    const seen = new Map<PlatformId, string>();
    let activeForeground = 0;
    let maxForeground = 0;

    await runPostScheduler({
      platforms: ['x', 'bluesky', 'tumblr', 'instagram'],
      autoPost: false,
      planOptions: { hasVideo: true },
      post: async (platform, execution): Promise<PostResultMessage> => {
        seen.set(platform, `${execution.lane}:${execution.forceForeground}`);
        if (execution.forceForeground) {
          activeForeground += 1;
          maxForeground = Math.max(maxForeground, activeForeground);
          activeForeground -= 1;
        }
        return { type: 'POST_RESULT', platform, success: true };
      },
    });

    expect(seen.get('instagram')).toBe('foreground:true');
    expect(seen.get('x')).toBe('foreground:true');
    expect(seen.get('tumblr')).toBe('foreground:true');
    expect(seen.get('bluesky')).toBe('foreground:true');
    expect(maxForeground).toBe(1);
  });
});

function deferred<T>(): { promise: Promise<T>; resolve: (value: T | PromiseLike<T>) => void } {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
