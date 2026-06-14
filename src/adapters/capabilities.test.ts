import { describe, expect, it } from 'vitest';
import type { PlatformId } from '../messages';
import type { ContentKind } from './types';
import { adapters, checkVideoConstraint } from './registry';

const EXPECTED_KINDS: Record<PlatformId, ContentKind[]> = {
  x: ['text', 'image', 'shortVideo', 'longVideo'],
  bluesky: ['text', 'image', 'shortVideo', 'longVideo'],
  threads: ['text', 'image', 'shortVideo', 'longVideo'],
  mastodon: ['text', 'image', 'shortVideo', 'longVideo'],
  misskey: ['text', 'image', 'shortVideo', 'longVideo'],
  tumblr: ['text', 'image', 'shortVideo', 'longVideo'],
  pixiv: ['image'],
  deviantart: ['image'],
  instagram: ['image', 'shortVideo'],
  tiktok: ['shortVideo'],
  youtube: ['shortVideo'],
};

const SHORT_VIDEO_PLATFORMS = Object.entries(EXPECTED_KINDS)
  .filter(([, kinds]) => kinds.includes('shortVideo'))
  .map(([platform]) => platform as PlatformId);

const IMAGE_ONLY_PLATFORMS = Object.entries(EXPECTED_KINDS)
  .filter(([, kinds]) => !kinds.includes('shortVideo') && !kinds.includes('longVideo'))
  .map(([platform]) => platform as PlatformId);

describe('adapter capability matrix', () => {
  it('keeps public content-kind support stable', () => {
    for (const [platform, expectedKinds] of Object.entries(EXPECTED_KINDS) as Array<[PlatformId, ContentKind[]]>) {
      expect(adapters[platform]?.kinds, platform).toEqual(expectedKinds);
    }
  });

  it('keeps video constraints present only for video-capable platforms', () => {
    for (const [platform, expectedKinds] of Object.entries(EXPECTED_KINDS) as Array<[PlatformId, ContentKind[]]>) {
      const supportsVideo = expectedKinds.includes('shortVideo') || expectedKinds.includes('longVideo');
      expect(!!adapters[platform]?.videoConstraints, platform).toBe(supportsVideo);
    }
  });

  it('accepts a normal 30s video on every video-capable platform', () => {
    for (const platform of SHORT_VIDEO_PLATFORMS) {
      expect(checkVideoConstraint(platform, 30, 10 * 1024 * 1024), platform).toBeNull();
    }
  });

  it('rejects video on image-only platforms', () => {
    for (const platform of IMAGE_ONLY_PLATFORMS) {
      expect(checkVideoConstraint(platform, 30, 10 * 1024 * 1024), platform).toContain('未対応');
    }
  });
});
