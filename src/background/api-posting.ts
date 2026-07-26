import type { ImageAttachment, PlatformId } from '../messages';
import type { BlueskySessionResult } from '../messages';
import { postViaApi as postBlueskyApi, postViaSession as postBlueskySession } from '../api/bluesky';
import type { Session as BlueskySession } from '../api/bluesky';
import { postViaApi as postMastodonApi } from '../api/mastodon';
import { postViaApi as postMisskeyApi } from '../api/misskey';
import type { ApiPostResult } from '../api/types';
import { getApiCredentials } from '../utils/api-credentials';
import { log } from '../utils/logger';
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
  if (platform === 'bluesky') {
    if (creds.bluesky) {
      return await postBlueskyApi(creds.bluesky, { text, images });
    }
    const session = await readBlueskySessionFromOpenTab();
    if (session) {
      const hasVideo = !!images?.some((image) => image.type.startsWith('video/'));
      log.info(`bluesky via borrowed web session API start: media=${images?.length ?? 0} video=${hasVideo}`);
      return await postBlueskySession(session, { text, images });
    }
    return 'no-credentials';
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

async function readBlueskySessionFromOpenTab(): Promise<BlueskySession | null> {
  let tabs: Browser.tabs.Tab[];
  try {
    tabs = await browser.tabs.query({});
  } catch (e) {
    log.warn(`bluesky API session lookup skipped: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }

  const blueskyTabs = tabs.filter((tab) => typeof tab.url === 'string' && /^https:\/\/bsky\.app\//.test(tab.url));
  for (const tab of blueskyTabs) {
    if (typeof tab.id !== 'number') continue;
    try {
      const response = await browser.tabs.sendMessage(tab.id, { type: 'GET_BLUESKY_SESSION' }) as
        BlueskySessionResult | null | undefined;
      if (response?.type !== 'BLUESKY_SESSION_RESULT') continue;
      if (!response.accessJwt || !response.did || !response.handle) continue;
      return {
        accessJwt: response.accessJwt,
        did: response.did,
        handle: response.handle,
        ...(response.pdsHost ? { pdsHost: response.pdsHost } : {}),
      };
    } catch {
      // Not every bsky.app tab is guaranteed to have the content script ready.
    }
  }
  return null;
}
