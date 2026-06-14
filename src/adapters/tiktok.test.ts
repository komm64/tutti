import { describe, expect, it } from 'vitest';
import { buildTikTokCaption, TIKTOK_EMPTY_CAPTION_SENTINEL } from './tiktok';

describe('buildTikTokCaption', () => {
  it('uses an invisible sentinel for empty captions so TikTok does not keep the filename', () => {
    expect(buildTikTokCaption('')).toBe(TIKTOK_EMPTY_CAPTION_SENTINEL);
  });

  it('keeps normal captions visible and bounded', () => {
    expect(buildTikTokCaption('hello')).toBe('hello');
    expect(buildTikTokCaption('a'.repeat(2300))).toHaveLength(2200);
  });
});
