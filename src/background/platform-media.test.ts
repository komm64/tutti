import { describe, expect, it, vi } from 'vitest';
import type { ImageAttachment, PlatformId } from '../messages';
import { adapters } from '../adapters/registry';
import { prepareMediaForPlatform } from './platform-media';

vi.mock('../utils/effective-limits', () => ({
  getEffectiveVideoConstraints: vi.fn(async (_platform: PlatformId, defaults) => defaults),
}));

const video: ImageAttachment = {
  name: 'clip.mp4',
  type: 'video/mp4',
  data: 'AA==',
  bytes: 1,
  durationS: 30,
};

const image: ImageAttachment = {
  name: 'photo.png',
  type: 'image/png',
  data: 'AA==',
  bytes: 1,
};

describe('prepareMediaForPlatform video guards', () => {
  it('does not reject Threads videos before dispatch', async () => {
    const adapter = adapters.threads;
    expect(adapter).toBeDefined();
    const result = await prepareMediaForPlatform(adapter!, 'threads', [video]);

    expect(result.ok).toBe(true);
  });

  it('normalizes mixed image and video input to video-only media', async () => {
    const adapter = adapters.threads;
    expect(adapter).toBeDefined();
    const result = await prepareMediaForPlatform(adapter!, 'threads', [image, video]);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.images).toEqual([video]);
  });

  it('rejects videos only on image-only platforms', async () => {
    for (const platform of ['pixiv', 'deviantart'] as const) {
      const adapter = adapters[platform];
      expect(adapter).toBeDefined();
      const result = await prepareMediaForPlatform(adapter!, platform, [video]);

      expect(result.ok, platform).toBe(false);
      if (!result.ok) expect(result.result.error, platform).toContain('未対応');
    }
  });
});
