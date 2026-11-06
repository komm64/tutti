import type { PlatformId } from '../types/platform';
import { checkVideoConstraint, getAdapter } from '../adapters/registry';
import { measureTextForPlatform, splitTextForPlatform } from '../utils/platform-text';
import { t } from '../utils/i18n';
import type { ImagePreview, PlatformOption, VideoPreview } from './types';

export type PopupContentKind = 'text' | 'image' | 'shortVideo' | 'longVideo';

export function resolveCurrentKind(images: readonly ImagePreview[], video: VideoPreview | null): PopupContentKind {
  if (video) return video.durationS > 60 ? 'longVideo' : 'shortVideo';
  if (images.length > 0) return 'image';
  return 'text';
}

export function countTotalPosts(
  platforms: readonly PlatformOption[],
  selectedIds: readonly PlatformId[],
  text: string,
): number {
  return selectedIds.reduce((sum, id) => {
    const platform = platforms.find((item) => item.id === id);
    if (!platform) return sum;
    return sum + splitTextForPlatform(platform.id, text, platform.limit).length;
  }, 0);
}

export interface DraftShape {
  text: string;
  images: readonly ImagePreview[];
  video: VideoPreview | null;
}

/**
 * Why a platform cannot take this draft, or null when it can. Blocked rows are
 * dimmed with this reason on hover and skipped by the post, so one unsuitable
 * network never blocks the others. Selection is kept across drafts, so a
 * network chosen for an earlier draft may be blocked by the current one.
 */
export function platformBlocker(platform: PlatformOption, draft: DraftShape): string | null {
  const adapter = getAdapter(platform.id);
  if (!adapter) return null;
  const kind = resolveCurrentKind(draft.images, draft.video);
  if (!adapter.kinds.includes(kind)) return kindBlocker(adapter.kinds, kind);
  const mediaBlocker = draft.video
    // Video size is compressed in the background, so only duration is checked here.
    ? checkVideoConstraint(platform.id, draft.video.durationS, 0)
    : draft.images.length > adapter.imageConstraints.maxImages
      ? t('constraintTooManyImages', String(adapter.imageConstraints.maxImages))
      : null;
  if (mediaBlocker) return mediaBlocker;
  // A media-only network cannot carry a text-only continuation, so long text
  // would publish a truncated first part and fail on the second.
  if (!adapter.kinds.includes('text') && measureTextForPlatform(platform.id, draft.text) > platform.limit) {
    return t('constraintTextTooLong', String(platform.limit));
  }
  return null;
}

function kindBlocker(kinds: readonly PopupContentKind[], kind: PopupContentKind): string {
  if (kind === 'text') {
    const takesImage = kinds.includes('image');
    const takesVideo = kinds.includes('shortVideo') || kinds.includes('longVideo');
    if (takesImage && takesVideo) return t('constraintMediaRequired');
    return t(takesImage ? 'constraintImageRequired' : 'constraintVideoRequired');
  }
  if (kind === 'image') return t('constraintImagesUnsupported');
  if (kind === 'longVideo' && kinds.includes('shortVideo')) return t('constraintLongVideoUnsupported');
  return t('constraintVideoUnsupported');
}

export function buildPlatformBlockers(
  platforms: readonly PlatformOption[],
  draft: DraftShape,
): Record<string, string | null> {
  return Object.fromEntries(platforms.map((platform) => [platform.id, platformBlocker(platform, draft)]));
}

export function filterUnblockedPlatforms(
  selectedIds: readonly PlatformId[],
  blockers: Record<string, string | null>,
): PlatformId[] {
  return selectedIds.filter((id) => !blockers[id]);
}
