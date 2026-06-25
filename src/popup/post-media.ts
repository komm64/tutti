import type { ImageAttachment, PlatformId, PostRequestMessage } from '../messages';
import { getAdapter } from '../adapters/registry';
import { packAttachmentForTransfer } from '../utils/attachment';
import { resizeImage } from '../utils/image-resize';
import type { ImagePreview, VideoPreview, Visibility } from './types';

export async function preparePostMedia(
  platforms: readonly PlatformId[],
  images: readonly ImagePreview[],
  video: VideoPreview | null,
  imageAlts: readonly string[],
): Promise<ImageAttachment[]> {
  if (video) {
    return [{
      name: video.name,
      type: video.type,
      data: video.data,
      durationS: video.durationS,
      ...(video.videoCodec ? { videoCodec: video.videoCodec } : {}),
      ...(video.videoCodecParameters ? { videoCodecParameters: video.videoCodecParameters } : {}),
    }];
  }
  if (images.length === 0) return [];

  // v0.4.81: per-SNS resize は background 側で行う。 popup では
  // **選択中プラットフォームの最大制約** をヘッダ cap として使い、
  // それ以下なら触らない (= 高品質を可能な限り保つ)。
  const maxLimit = Math.max(
    ...platforms
      .map((id) => getAdapter(id)?.imageConstraints.maxBytesPerImage)
      .filter((x): x is number => typeof x === 'number'),
    0,
  );

  return Promise.all(
    images.map(async (img, idx) => {
      const data = maxLimit > 0
        ? await resizeImage(img.data, img.type, maxLimit)
        : img.data;
      const resized = data !== img.data;
      return {
        name: resized ? img.name.replace(/\.[^.]+$/, '.jpg') : img.name,
        type: resized ? 'image/jpeg' : img.type,
        data,
        alt: imageAlts[idx] || undefined,
      };
    }),
  );
}

export async function buildPostRequest(input: {
  text: string;
  platforms: PlatformId[];
  images: readonly ImagePreview[];
  video: VideoPreview | null;
  imageAlts: readonly string[];
  autoPost: boolean;
  cw: string;
  visibility: Visibility;
  trimToS: number | null;
}): Promise<PostRequestMessage> {
  const media = await preparePostMedia(input.platforms, input.images, input.video, input.imageAlts);
  const wireMedia = await Promise.all(media.map((m) => packAttachmentForTransfer(m)));
  return {
    type: 'POST_REQUEST',
    text: input.text,
    platforms: input.platforms,
    images: wireMedia.length > 0 ? wireMedia : undefined,
    autoPost: input.autoPost,
    cw: input.cw.trim() || undefined,
    visibility: input.visibility !== 'public' ? input.visibility : undefined,
    trimVideoToSeconds: input.trimToS ?? undefined,
  };
}
