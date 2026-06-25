import { describe, expect, it } from 'vitest';
import {
  needsVideoCodecTranscodeForPlatforms,
  resolveSafeVideoTargetBytes,
  shouldNormalizeVideoForSafePosting,
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

  it('keeps small videos unchanged when no transform is requested', () => {
    const fortyMiB = 40 * 1024 * 1024;
    const small = 12 * 1024 * 1024;

    expect(shouldTranscodeVideoForBudget(small, fortyMiB, false, false)).toBe(false);
  });

  it('transcodes when trimming or vertical letterboxing is requested', () => {
    expect(shouldTranscodeVideoForBudget(1, Infinity, false, true)).toBe(true);
    expect(shouldTranscodeVideoForBudget(1, Infinity, true, false)).toBe(true);
  });

  it('transcodes HEVC videos for Bluesky even when size is within budget', () => {
    expect(shouldTranscodeVideoForBudget(12, Infinity, false, false, true)).toBe(true);
    expect(needsVideoCodecTranscodeForPlatforms(['bluesky'], {
      name: 'clip.mp4',
      type: 'video/mp4',
      durationS: 15,
      videoCodec: 'hevc',
      videoCodecParameters: 'hev1.1.6.L93.90',
    })).toBe(true);
    expect(needsVideoCodecTranscodeForPlatforms(['tumblr'], {
      name: 'clip.mp4',
      type: 'video/mp4',
      durationS: 15,
      videoCodec: 'hevc',
    })).toBe(false);
  });

  it('normalizes every posting video to a safe mp4/h264/aac path', () => {
    const fortyMiB = 40 * 1024 * 1024;
    const small = 2 * 1024 * 1024;
    const video = {
      name: 'clip.mp4',
      type: 'video/mp4',
      durationS: 15,
      videoCodec: 'avc',
    };

    expect(shouldNormalizeVideoForSafePosting(video)).toBe(true);
    expect(shouldTranscodeVideoForBudget(small, fortyMiB, false, false, false, true)).toBe(true);
  });
});
