import type { ImageAttachment, PlatformId } from '../messages';
import { postViaApi as postBlueskyApi } from '../api/bluesky';
import { postViaApi as postMastodonApi } from '../api/mastodon';
import { postViaApi as postMisskeyApi } from '../api/misskey';
import type { ApiPostResult } from '../api/types';
import { getApiCredentials } from '../utils/api-credentials';
import { parseMastodonStatusIdFromUrl } from '../utils/reply-compose';

export type ApiPostingVisibility = 'public' | 'unlisted' | 'private' | 'direct';

/**
 * 設定された API credentials があれば API path で投稿。無ければ 'no-credentials'。
 * P15 で対応しているのは Bluesky / Mastodon / Misskey の 3 platforms。
 */
export async function tryApiPath(
  platform: PlatformId,
  text: string,
  images?: ImageAttachment[],
  cw?: string,
  visibility?: ApiPostingVisibility,
  replyToUrl?: string,
): Promise<ApiPostResult | 'no-credentials'> {
  const creds = await getApiCredentials();
  const hasVideo = !!images?.some((image) => image.type.startsWith('video/'));
  if (platform === 'bluesky' && creds.bluesky) {
    // The Bluesky API client currently supports image embeds only. Let the DOM
    // path handle videos so a video post cannot silently become text-only.
    if (hasVideo) return 'no-credentials';
    return await postBlueskyApi(creds.bluesky, { text, images });
  }
  if (platform === 'mastodon' && creds.mastodon) {
    return await postMastodonApi(creds.mastodon, {
      text,
      images,
      cw,
      visibility,
      replyToId: replyToUrl ? parseMastodonStatusIdFromUrl(replyToUrl) : undefined,
    });
  }
  if (platform === 'misskey' && creds.misskey) {
    return await postMisskeyApi(creds.misskey, { text, images, cw, visibility });
  }
  return 'no-credentials';
}
