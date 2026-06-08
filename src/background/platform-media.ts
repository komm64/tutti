import type { ImageAttachment, PlatformId, PostResultMessage } from '../messages';
import type { PlatformAdapter } from '../adapters/types';
import { checkImageConstraint } from '../adapters/registry';
import { getEffectiveVideoConstraints } from '../utils/effective-limits';
import { attachmentSize } from '../utils/attachment';
import { t } from '../utils/i18n';
import {
  letterboxImagesForInstagram,
  maybeResizeImagesForPlatform,
} from './media-preprocess';

export type PlatformMediaPreparation =
  | { ok: true; images?: ImageAttachment[] }
  | { ok: false; result: PostResultMessage };

export async function prepareMediaForPlatform(
  adapter: PlatformAdapter,
  platform: PlatformId,
  images?: ImageAttachment[],
): Promise<PlatformMediaPreparation> {
  const videoItem = images?.find((img) => img.type.startsWith('video/'));
  if (videoItem) {
    const isLong = (videoItem.durationS ?? 0) > 60;
    const requiredKind = isLong ? 'longVideo' : 'shortVideo';
    if (!adapter.kinds.includes(requiredKind)) {
      return {
        ok: false,
        result: {
          type: 'POST_RESULT',
          platform,
          success: false,
          error: t(requiredKind === 'longVideo' ? 'runtimeLongVideoUnsupported' : 'runtimeShortVideoUnsupported'),
        },
      };
    }

    const effective = adapter.videoConstraints
      ? await getEffectiveVideoConstraints(platform, adapter.videoConstraints)
      : null;
    if (effective) {
      const durationS = videoItem.durationS ?? 0;
      const bytes = attachmentSize(videoItem);
      if (effective.maxDurationS > 0 && durationS > effective.maxDurationS) {
        return {
          ok: false,
          result: {
            type: 'POST_RESULT',
            platform,
            success: false,
            error: t('runtimeVideoDurationExceeded', effective.maxDurationS, Math.round(durationS)),
          },
        };
      }
      if (effective.maxBytes > 0 && bytes > effective.maxBytes) {
        return {
          ok: false,
          result: {
            type: 'POST_RESULT',
            platform,
            success: false,
            error: t(
              'runtimeFileSizeExceeded',
              Math.round(effective.maxBytes / 1024 / 1024),
              Math.round(bytes / 1024 / 1024),
            ),
          },
        };
      }
    }
    return { ok: true, images };
  }

  if (!images || images.length === 0) return { ok: true, images };

  let preparedImages = await maybeResizeImagesForPlatform(adapter, images);
  const err = checkImageConstraint(
    platform,
    preparedImages.map((img) => attachmentSize(img)),
  );
  if (err) {
    return {
      ok: false,
      result: { type: 'POST_RESULT', platform, success: false, error: err },
    };
  }

  if (adapter.id === 'instagram') {
    preparedImages = await letterboxImagesForInstagram(preparedImages);
  }

  return { ok: true, images: preparedImages };
}
