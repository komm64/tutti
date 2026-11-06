import { describe, expect, it } from 'vitest';
import { getAdapter } from '../adapters/registry';
import type { PlatformId } from '../types/platform';
import { t } from '../utils/i18n';
import {
  buildPlatformBlockers,
  filterUnblockedPlatforms,
  platformBlocker,
  resolveCurrentKind,
  type DraftShape,
} from './compatibility';
import type { ImagePreview, PlatformOption, VideoPreview } from './types';

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

function option(id: PlatformId): PlatformOption {
  return { id, name: id, limit: getAdapter(id)!.charLimit, available: true };
}

function images(count: number): ImagePreview[] {
  return Array.from({ length: count }, (_, i) => ({
    name: `${i}.png`,
    type: 'image/png',
    data: 'AA==',
    previewUrl: `blob:${i}`,
  }));
}

function video(durationS: number): VideoPreview {
  return { name: 'clip.mp4', type: 'video/mp4', data: 'AA==', durationS, previewUrl: 'blob:clip' };
}

function draft(partial: Partial<DraftShape>): DraftShape {
  return { text: '', images: [], video: null, ...partial };
}

describe('resolveCurrentKind', () => {
  it('classifies the current draft shape without ambiguity', () => {
    expect(resolveCurrentKind([], null)).toBe('text');
    expect(resolveCurrentKind(images(1), null)).toBe('image');
    expect(resolveCurrentKind([], video(30))).toBe('shortVideo');
    expect(resolveCurrentKind([], video(61))).toBe('longVideo');
  });
});

describe('platformBlocker', () => {
  it('explains content kinds a platform cannot take', () => {
    expect(platformBlocker(option('pixiv'), draft({ text: 'hi' }))).toBe(t('constraintImageRequired'));
    expect(platformBlocker(option('tiktok'), draft({ text: 'hi' }))).toBe(t('constraintVideoRequired'));
    expect(platformBlocker(option('instagram'), draft({ text: 'hi' }))).toBe(t('constraintMediaRequired'));
    expect(platformBlocker(option('tiktok'), draft({ images: images(1) }))).toBe(t('constraintImagesUnsupported'));
    expect(platformBlocker(option('pixiv'), draft({ video: video(30) }))).toBe(t('constraintVideoUnsupported'));
    expect(platformBlocker(option('instagram'), draft({ video: video(61) })))
      .toBe(t('constraintLongVideoUnsupported'));
  });

  it('blocks a media-only platform when the text needs more than one post', () => {
    const pixiv = option('pixiv');
    const fits = draft({ text: 'a'.repeat(pixiv.limit), images: images(1) });
    const tooLong = draft({ text: 'a'.repeat(pixiv.limit + 1), images: images(1) });

    expect(platformBlocker(pixiv, fits)).toBeNull();
    expect(platformBlocker(pixiv, tooLong)).toBe(t('constraintTextTooLong', String(pixiv.limit)));
    // Text-capable platforms split long text into a thread instead.
    expect(platformBlocker(option('x'), tooLong)).toBeNull();
    const longVideoCaption = draft({ text: 'a'.repeat(option('tiktok').limit + 1), video: video(30) });
    expect(platformBlocker(option('tiktok'), longVideoCaption))
      .toBe(t('constraintTextTooLong', String(option('tiktok').limit)));
  });

  it('blocks a platform when more images are attached than it accepts', () => {
    expect(platformBlocker(option('deviantart'), draft({ images: images(1) }))).toBeNull();
    expect(platformBlocker(option('deviantart'), draft({ images: images(2) })))
      .toBe(t('constraintTooManyImages', '1'));
    expect(platformBlocker(option('x'), draft({ images: images(4) }))).toBeNull();
  });

  it('does not block normal short videos on video-capable platforms', () => {
    for (const id of VIDEO_CAPABLE_PLATFORMS) {
      expect(platformBlocker(option(id), draft({ video: video(30) })), id).toBeNull();
    }
  });

  it('does not block oversized videos because background compression handles size', () => {
    const large = {
      ...video(30),
      data: {
        length: Math.ceil((90 * 1024 * 1024 * 4) / 3),
        endsWith: () => false,
      } as unknown as string,
    };
    expect(platformBlocker(option('bluesky'), draft({ video: large }))).toBeNull();
  });
});

describe('filterUnblockedPlatforms', () => {
  it('skips blocked platforms instead of blocking the whole post', () => {
    const selected: PlatformId[] = ['x', 'bluesky', 'deviantart', 'pixiv', 'tiktok'];
    const blockers = buildPlatformBlockers(
      selected.map(option),
      draft({ text: 'a'.repeat(1500), images: images(2) }),
    );

    expect(filterUnblockedPlatforms(selected, blockers)).toEqual(['x', 'bluesky']);
    expect(blockers).toMatchObject({
      deviantart: t('constraintTooManyImages', '1'),
      pixiv: t('constraintTextTooLong', String(getAdapter('pixiv')!.charLimit)),
      tiktok: t('constraintImagesUnsupported'),
    });
  });
});
