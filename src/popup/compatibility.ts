import type { PlatformId } from '../messages';
import { checkVideoConstraint, getAdapter } from '../adapters/registry';
import { splitTextForPlatform } from '../utils/platform-text';
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

export function buildVideoCompatibility(
  platforms: readonly PlatformOption[],
  video: VideoPreview | null,
): Record<string, string | null> {
  if (!video) return {};
  return Object.fromEntries(
    platforms.map((platform) => [
      platform.id,
      // 動画サイズは background 側で選択中 SNS の最小上限まで自動圧縮する。
      // popup は「圧縮前サイズ」では止めず、非対応/尺超過だけを事前エラーにする。
      checkVideoConstraint(platform.id, video.durationS, 0),
    ]),
  );
}

export function buildImageCompatibility(
  platforms: readonly PlatformOption[],
  images: readonly ImagePreview[],
  video: VideoPreview | null,
  tooManyImagesMessage: (maxImages: number) => string,
): Record<string, string | null> {
  if (video || images.length === 0) return {};
  return Object.fromEntries(
    platforms.map((platform) => {
      const adapter = getAdapter(platform.id);
      if (!adapter) return [platform.id, null];
      if (images.length > adapter.imageConstraints.maxImages) {
        return [platform.id, tooManyImagesMessage(adapter.imageConstraints.maxImages)];
      }
      return [platform.id, null];
    }),
  );
}

export interface SelectedCompatibilityError {
  platform: PlatformId;
  error: string;
}

export function buildSelectedCompatibilityErrors(
  selectedIds: readonly PlatformId[],
  videoCompatibility: Record<string, string | null>,
  imageCompatibility: Record<string, string | null>,
): SelectedCompatibilityError[] {
  return selectedIds.flatMap((platform) => {
    const error = videoCompatibility[platform] || imageCompatibility[platform];
    return error ? [{ platform, error }] : [];
  });
}
