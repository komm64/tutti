import type { PlatformId } from '../messages';
import type { ImagePreview, VideoPreview, Visibility } from './types';

export interface DraftKeyInput {
  text: string;
  selectedIds: readonly PlatformId[];
  images: readonly ImagePreview[];
  video: VideoPreview | null;
  imageAlts: readonly string[];
  cw: string;
  visibility: Visibility;
  trimToS: number | null;
  autoPost: boolean;
}

export function buildDraftKey(input: DraftKeyInput): string {
  return JSON.stringify({
    text: input.text,
    selectedIds: [...input.selectedIds].sort(),
    images: input.images.map((image, index) => ({
      name: image.name,
      type: image.type,
      dataLength: image.data.length,
      alt: input.imageAlts[index] ?? '',
    })),
    video: input.video
      ? {
          name: input.video.name,
          type: input.video.type,
          dataLength: input.video.data.length,
          durationS: Math.round(input.video.durationS),
        }
      : null,
    cw: input.cw,
    visibility: input.visibility,
    trimToS: input.trimToS,
    autoPost: input.autoPost,
  });
}
