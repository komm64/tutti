import { describe, expect, it } from 'vitest';
import type { PostResultMessage } from '../messages';
import {
  postedResults,
  shouldRunPostCompletionSideEffects,
  toPreviewResult,
} from './post-result-policy';

describe('post result policy', () => {
  it('marks preview results and strips post evidence', () => {
    const result = toPreviewResult({
      type: 'POST_RESULT',
      platform: 'x',
      success: true,
      confirmed: true,
      url: 'https://x.com/alice/status/123',
      verify: { verified: true, issues: [] },
    });

    expect(result).toMatchObject({
      type: 'POST_RESULT',
      platform: 'x',
      success: true,
      confirmed: true,
      preview: true,
    });
    expect(result.url).toBeUndefined();
    expect(result.verify).toBeUndefined();
  });

  it('keeps preview results out of posted result sets', () => {
    const actual: PostResultMessage = {
      type: 'POST_RESULT',
      platform: 'x',
      success: true,
      url: 'https://x.com/alice/status/123',
    };
    const preview = toPreviewResult({
      type: 'POST_RESULT',
      platform: 'bluesky',
      success: true,
    });

    expect(postedResults([preview, actual])).toEqual([actual]);
  });

  it('runs completion side effects only for real post requests', () => {
    const preview = toPreviewResult({
      type: 'POST_RESULT',
      platform: 'x',
      success: true,
    });
    const actual: PostResultMessage = {
      type: 'POST_RESULT',
      platform: 'x',
      success: true,
    };

    expect(shouldRunPostCompletionSideEffects(false, [actual])).toBe(false);
    expect(shouldRunPostCompletionSideEffects(true, [preview])).toBe(false);
    expect(shouldRunPostCompletionSideEffects(true, [actual])).toBe(true);
  });
});
