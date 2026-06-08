import { describe, expect, it } from 'vitest';
import { createPostingStateManager } from './posting-state';

describe('posting state manager', () => {
  it('tracks per-platform progress and exposes immutable snapshots', () => {
    const updates: Array<[number, number]> = [];
    const manager = createPostingStateManager({
      onProgressUpdate: (done, total) => updates.push([done, total]),
      now: () => 1000,
    });

    manager.start(['x', 'bluesky']);
    manager.recordResult({ type: 'POST_RESULT', platform: 'x', success: true });

    const snapshot = manager.snapshot();
    expect(snapshot).toMatchObject({
      posting: true,
      postingState: {
        platforms: ['x', 'bluesky'],
        pending: ['bluesky'],
        results: [{ type: 'POST_RESULT', platform: 'x', success: true }],
        done: false,
      },
    });
    expect(updates).toEqual([[0, 2], [1, 2]]);

    snapshot.postingState?.pending.push('threads');
    expect(manager.snapshot().postingState?.pending).toEqual(['bluesky']);
  });

  it('keeps final results available after posting completes', () => {
    let now = 1000;
    const manager = createPostingStateManager({ now: () => now });

    manager.start(['x']);
    manager.recordResult({ type: 'POST_RESULT', platform: 'x', success: true });
    now = 2500;
    manager.markDone();

    expect(manager.shouldClearBadgeOnRead()).toBe(true);
    expect(manager.snapshot()).toMatchObject({
      posting: false,
      postingState: {
        platforms: ['x'],
        pending: [],
        done: true,
        finishedAt: 2500,
      },
    });
  });

  it('clears only the retained posting state', () => {
    const manager = createPostingStateManager();

    manager.start(['x']);
    manager.clearPostingState();

    expect(manager.snapshot()).toMatchObject({
      posting: true,
      postingState: null,
    });
  });

  it('tracks compression independently from posting state', () => {
    const manager = createPostingStateManager();

    manager.setCompression({ progress: 0.5, stage: 'transcode' });
    expect(manager.snapshot().compression).toEqual({ progress: 0.5, stage: 'transcode' });

    manager.setCompression(null);
    expect(manager.snapshot().compression).toBeNull();
  });
});
