import { describe, expect, it } from 'vitest';
import type { PlatformId } from '../messages';
import {
  buildSelectedCompatibilityErrors,
  buildVideoCompatibility,
  resolveCurrentKind,
} from './compatibility';

const VIDEO_CAPABLE_PLATFORMS: PlatformId[] = [
  'x',
  'bluesky',
  'threads',
  'mastodon',
  'misskey',
  'tumblr',
  'instagram',
  'tiktok',
  'youtube',
];

describe('buildSelectedCompatibilityErrors', () => {
  it('classifies the current draft shape without ambiguity', () => {
    expect(resolveCurrentKind([], null)).toBe('text');
    expect(resolveCurrentKind(
      [{ name: 'photo.png', type: 'image/png', data: 'AA==', previewUrl: 'blob:photo' }],
      null,
    )).toBe('image');
    expect(resolveCurrentKind(
      [],
      { name: 'clip.mp4', type: 'video/mp4', data: 'AA==', durationS: 30, previewUrl: 'blob:clip' },
    )).toBe('shortVideo');
    expect(resolveCurrentKind(
      [],
      { name: 'long.mp4', type: 'video/mp4', data: 'AA==', durationS: 61, previewUrl: 'blob:long' },
    )).toBe('longVideo');
  });

  it('returns only selected platform media errors', () => {
    expect(buildSelectedCompatibilityErrors(
      ['x', 'threads'],
      { threads: 'Short videos are not supported.', bluesky: 'too large' },
      { x: null },
    )).toEqual([
      { platform: 'threads', error: 'Short videos are not supported.' },
    ]);
  });

  it('does not report Threads short video as unsupported', () => {
    const compatibility = buildVideoCompatibility(
      [{ id: 'threads', name: 'Threads', limit: 500, available: true }],
      { name: 'clip.mp4', type: 'video/mp4', data: 'AA==', durationS: 30, previewUrl: 'blob:test' },
    );

    expect(compatibility.threads).toBeNull();
  });

  it('does not report normal short videos as unsupported for video-capable platforms', () => {
    const compatibility = buildVideoCompatibility(
      VIDEO_CAPABLE_PLATFORMS.map((id) => ({ id, name: id, limit: 500, available: true })),
      { name: 'clip.mp4', type: 'video/mp4', data: 'AA==', durationS: 30, previewUrl: 'blob:test' },
    );

    for (const platform of VIDEO_CAPABLE_PLATFORMS) {
      expect(compatibility[platform], platform).toBeNull();
    }
  });

  it('does not block oversized videos in the popup because background compression handles size', () => {
    const compatibility = buildVideoCompatibility(
      [{ id: 'bluesky', name: 'Bluesky', limit: 300, available: true }],
      {
        name: 'large.mp4',
        type: 'video/mp4',
        data: {
          length: Math.ceil((90 * 1024 * 1024 * 4) / 3),
          endsWith: () => false,
        } as unknown as string,
        durationS: 30,
        previewUrl: 'blob:large',
      },
    );

    expect(compatibility.bluesky).toBeNull();
    expect(buildSelectedCompatibilityErrors(['bluesky'], compatibility, {})).toEqual([]);
  });
});
