import { describe, expect, it } from 'vitest';
import {
  buildPostExecutionPlan,
  needsForegroundPreview,
  resolvePostConcurrency,
} from './post-concurrency';

describe('post execution plan', () => {
  it('serializes real posts in one lane', () => {
    expect(resolvePostConcurrency(['x', 'bluesky', 'threads'], true)).toBe(1);
    expect(buildPostExecutionPlan(['x', 'bluesky', 'threads'], true).lanes).toEqual([{
      id: 'serial',
      platforms: ['x', 'bluesky', 'threads'],
      concurrency: 1,
      forceForeground: false,
    }]);
  });

  it('keeps low-risk preview flows in the background pool', () => {
    expect(resolvePostConcurrency(['bluesky', 'threads', 'mastodon', 'misskey'], false)).toBe(3);
    expect(buildPostExecutionPlan(['bluesky', 'threads', 'mastodon', 'misskey'], false).lanes).toEqual([{
      id: 'background',
      platforms: ['bluesky', 'threads', 'mastodon', 'misskey'],
      concurrency: 3,
      forceForeground: false,
    }]);
  });

  it('runs mixed preview selections as foreground plus background lanes', () => {
    expect(resolvePostConcurrency(['x', 'bluesky', 'threads', 'mastodon'], false)).toBe(4);
    expect(buildPostExecutionPlan(['x', 'bluesky', 'threads', 'mastodon'], false).lanes).toEqual([
      {
        id: 'foreground',
        platforms: ['x'],
        concurrency: 1,
        forceForeground: true,
      },
      {
        id: 'background',
        platforms: ['bluesky', 'threads', 'mastodon'],
        concurrency: 3,
        forceForeground: false,
      },
    ]);
  });

  it('keeps high-risk preview platforms in the foreground lane', () => {
    expect(needsForegroundPreview('x')).toBe(true);
    expect(needsForegroundPreview('tumblr')).toBe(true);
    expect(needsForegroundPreview('instagram')).toBe(true);
    expect(needsForegroundPreview('bluesky')).toBe(false);
    expect(resolvePostConcurrency(['tiktok', 'youtube'], false)).toBe(1);
  });

  it('keeps X and Tumblr out of the foreground lane for video previews', () => {
    expect(needsForegroundPreview('x', { hasVideo: true })).toBe(false);
    expect(needsForegroundPreview('tumblr', { hasVideo: true })).toBe(false);
    expect(needsForegroundPreview('instagram', { hasVideo: true })).toBe(true);
    expect(buildPostExecutionPlan(['x', 'bluesky', 'tumblr', 'instagram'], false, { hasVideo: true }).lanes)
      .toEqual([
        {
          id: 'foreground',
          platforms: ['instagram'],
          concurrency: 1,
          forceForeground: true,
        },
        {
          id: 'background',
          platforms: ['x', 'bluesky', 'tumblr'],
          concurrency: 1,
          forceForeground: false,
        },
      ]);
    expect(resolvePostConcurrency(['x', 'bluesky', 'tumblr', 'instagram'], false, { hasVideo: true })).toBe(2);
  });
});
