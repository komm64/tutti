import { describe, expect, it } from 'vitest';
import { resolvePostConcurrency } from './post-concurrency';

describe('resolvePostConcurrency', () => {
  it('serializes real posts', () => {
    expect(resolvePostConcurrency(['x', 'bluesky', 'threads'], true)).toBe(1);
  });

  it('keeps normal preview flows parallel', () => {
    expect(resolvePostConcurrency(['x', 'bluesky', 'threads', 'mastodon'], false)).toBe(3);
  });

  it('serializes preview when a foreground-only platform is selected', () => {
    expect(resolvePostConcurrency(['x', 'instagram'], false)).toBe(1);
    expect(resolvePostConcurrency(['tiktok', 'youtube'], false)).toBe(1);
  });
});
