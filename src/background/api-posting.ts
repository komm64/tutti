import type { ImageAttachment } from '../messages';
import type { BlueskySessionResult } from '../messages';
import {
  postThreadViaApi as postBlueskyThreadApi,
  postThreadViaSession as postBlueskyThreadSession,
  postViaApi as postBlueskyApi,
  postViaSession as postBlueskySession,
} from '../api/bluesky';
import type { Session as BlueskySession } from '../api/bluesky';
import { postViaApi as postMastodonApi } from '../api/mastodon';
import { postViaApi as postMisskeyApi } from '../api/misskey';
import type { ApiPostResult } from '../api/types';
import { getLastSeenUsers } from '../storage/platform-users';
import { getApiCredentials } from '../utils/api-credentials';
import { log } from '../utils/logger';
import { parseMastodonStatusIdFromUrl } from '../utils/reply-compose';
import { waitForWebActionPacing } from '../utils/web-action-pacing';

export type ApiPostingVisibility = 'public' | 'unlisted' | 'private' | 'direct';

export interface ApiPostingInput {
  text: string,
  images?: ImageAttachment[],
  cw?: string,
  visibility?: ApiPostingVisibility,
  replyToUrl?: string,
}

export type ApiPostingStrategy = (
  input: ApiPostingInput,
) => Promise<ApiPostResult | 'no-credentials'>;

export interface ApiThreadPostingInput {
  chunks: string[];
  images?: ImageAttachment[];
}

export type ApiThreadPostingStrategy = (
  input: ApiThreadPostingInput,
) => Promise<ApiPostResult | 'no-credentials'>;

export async function tryBlueskyApiPost({
  text,
  images,
}: ApiPostingInput): Promise<ApiPostResult | 'no-credentials'> {
  const creds = await getApiCredentials();
  if (creds.bluesky) {
    await waitForWebActionPacing('submit');
    return await postBlueskyApi(creds.bluesky, { text, images });
  }
  const session = await readBlueskySessionFromOpenTab();
  if (session) {
    const hasVideo = !!images?.some((image) => image.type.startsWith('video/'));
    log.info(`bluesky via borrowed web session API start: media=${images?.length ?? 0} video=${hasVideo}`);
    await waitForWebActionPacing('submit');
    return fallbackOnRejectedSession(await postBlueskySession(session, { text, images }));
  }
  return 'no-credentials';
}

export async function tryBlueskyApiThreadPost({
  chunks,
  images,
}: ApiThreadPostingInput): Promise<ApiPostResult | 'no-credentials'> {
  const creds = await getApiCredentials();
  if (creds.bluesky) {
    await waitForWebActionPacing('submit');
    return await postBlueskyThreadApi(creds.bluesky, { chunks, images });
  }
  const session = await readBlueskySessionFromOpenTab();
  if (session) {
    const hasVideo = !!images?.some((image) => image.type.startsWith('video/'));
    log.info(
      `bluesky thread via borrowed web session API start: ` +
      `chunks=${chunks.length} media=${images?.length ?? 0} video=${hasVideo}`,
    );
    await waitForWebActionPacing('submit');
    return fallbackOnRejectedSession(await postBlueskyThreadSession(session, { chunks, images }));
  }
  return 'no-credentials';
}

export async function tryMastodonApiPost({
  text,
  images,
  cw,
  visibility,
  replyToUrl,
}: ApiPostingInput): Promise<ApiPostResult | 'no-credentials'> {
  const creds = await getApiCredentials();
  if (creds.mastodon) {
    await waitForWebActionPacing('submit');
    return await postMastodonApi(creds.mastodon, {
      text,
      images,
      cw,
      visibility,
      replyToId: replyToUrl ? parseMastodonStatusIdFromUrl(replyToUrl) : undefined,
    });
  }
  return 'no-credentials';
}

export async function tryMisskeyApiPost({
  text,
  images,
  cw,
  visibility,
}: ApiPostingInput): Promise<ApiPostResult | 'no-credentials'> {
  const creds = await getApiCredentials();
  if (creds.misskey) {
    await waitForWebActionPacing('submit');
    return await postMisskeyApi(creds.misskey, { text, images, cw, visibility });
  }
  return 'no-credentials';
}

/** session token の残り有効期間がこれ未満なら使わない (upload 中の失効を避ける) */
const SESSION_MIN_REMAINING_MS = 60_000;

/** JWT の exp (ms)。読めなければ null。 */
export function readJwtExpiryMs(jwt: string): number | null {
  const part = jwt.split('.')[1];
  if (!part) return null;
  try {
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(atob(b64.padEnd(Math.ceil(b64.length / 4) * 4, '='))) as { exp?: unknown };
    return typeof payload.exp === 'number' ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

function normalizeHandle(handle: string): string {
  return handle.trim().replace(/^@/, '').toLowerCase();
}

/**
 * 借用 session が投稿前にサーバ側で拒否された (record 未作成) 場合は
 * 'no-credentials' を返して DOM path に回す。uncertain / 成功はそのまま。
 */
function fallbackOnRejectedSession(result: ApiPostResult): ApiPostResult | 'no-credentials' {
  if (result.success || result.uncertain) return result;
  if (/ExpiredToken|InvalidToken|AuthMissing|\b401\b/i.test(result.error ?? '')) {
    log.warn('bluesky borrowed web session rejected; falling back to DOM path');
    return 'no-credentials';
  }
  return result;
}

async function readBlueskySessionFromOpenTab(): Promise<BlueskySession | null> {
  let tabs: Browser.tabs.Tab[];
  let expectedUser: string | undefined;
  try {
    tabs = await browser.tabs.query({});
    expectedUser = (await getLastSeenUsers()).bluesky ?? undefined;
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
      if (expectedUser && normalizeHandle(response.handle) !== normalizeHandle(expectedUser)) {
        log.info('bluesky web session belongs to a different account; skipping');
        continue;
      }
      const expiresAt = readJwtExpiryMs(response.accessJwt);
      if (expiresAt === null || expiresAt - Date.now() < SESSION_MIN_REMAINING_MS) {
        log.info('bluesky web session token is expired or unreadable; skipping');
        continue;
      }
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
