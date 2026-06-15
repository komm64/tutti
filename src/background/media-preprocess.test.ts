import { describe, expect, it } from 'vitest';
import {
  resolveSafeVideoTargetBytes,
  shouldTranscodeVideoForBudget,
} from './media-preprocess';

describe('video preprocessing budget', () => {
  it('targets 90% of the tightest platform limit instead of the exact limit', () => {
    const fortyMiB = 40 * 1024 * 1024;

    expect(resolveSafeVideoTargetBytes(80 * 1024 * 1024, fortyMiB)).toBe(
      Math.floor(fortyMiB * 0.9),
    );
  });

  it('transcodes videos that are under the hard limit but too close to it', () => {
    const fortyMiB = 40 * 1024 * 1024;
    const nearLimit = 38 * 1024 * 1024;

    expect(shouldTranscodeVideoForBudget(nearLimit, fortyMiB, false, false)).toBe(true);
  });

  it('keeps small videos unchanged when no transform is needed', () => {
    const fortyMiB = 40 * 1024 * 1024;
    const small = 12 * 1024 * 1024;

    expect(shouldTranscodeVideoForBudget(small, fortyMiB, false, false)).toBe(false);
  });

  it('transcodes when trimming or vertical letterboxing is requested', () => {
    expect(shouldTranscodeVideoForBudget(1, Infinity, false, true)).toBe(true);
    expect(shouldTranscodeVideoForBudget(1, Infinity, true, false)).toBe(true);
  });
});
