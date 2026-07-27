import type { ImageAttachment } from '../messages';
import type { ApiPostResult } from '../api/types';
import type { PlatformId } from '../types/platform';
import {
  tryBlueskyApiPost,
  tryMastodonApiPost,
  tryMisskeyApiPost,
  type ApiPostingStrategy,
  type ApiPostingVisibility,
} from './api-posting';

export interface BackgroundPlatformStrategy {
  /** 投稿 URL から platform 固有の安定 post ID を抽出する。 */
  parsePostId: (url: URL) => string | null;
  /** credentials / borrowed session がある場合だけ使う API posting 手続き。 */
  apiPost?: ApiPostingStrategy;
}

/**
 * background 固有の platform 手続きを集約する registry。
 * 新 platform は adapter registry と同時に必ずここへ登録する。
 */
export const backgroundPlatformStrategies: Record<PlatformId, BackgroundPlatformStrategy> = {
  x: {
    parsePostId: ({ pathname }) => pathname.match(/\/status(?:es)?\/(\d+)/)?.[1] ?? null,
  },
  bluesky: {
    parsePostId: ({ pathname }) => pathname.match(/\/post\/([a-zA-Z0-9]+)/)?.[1] ?? null,
    apiPost: tryBlueskyApiPost,
  },
  threads: {
    parsePostId: ({ pathname }) => pathname.match(/\/post\/([A-Za-z0-9_-]+)/)?.[1] ?? null,
  },
  mastodon: {
    parsePostId: ({ pathname }) => (
      pathname.match(/\/@[\w@.-]+\/(\d+)/)?.[1]
      ?? pathname.match(/\/users\/\w+\/statuses\/(\d+)/)?.[1]
      ?? null
    ),
    apiPost: tryMastodonApiPost,
  },
  misskey: {
    parsePostId: ({ pathname }) => pathname.match(/\/notes\/([a-zA-Z0-9]+)/)?.[1] ?? null,
    apiPost: tryMisskeyApiPost,
  },
  tumblr: {
    parsePostId: ({ pathname }) => (
      pathname.match(/\/post\/(\d+)/)?.[1]
      ?? pathname.match(/^\/[^/]+\/(\d+)(?:\/|$)/)?.[1]
      ?? null
    ),
  },
  pixiv: {
    parsePostId: ({ pathname }) => pathname.match(/\/artworks\/(\d+)/)?.[1] ?? null,
  },
  deviantart: {
    parsePostId: ({ pathname }) => (
      pathname.match(/-(\d+)\/?$/)?.[1]
      ?? pathname.match(/\/art\/(\d+)\/?$/)?.[1]
      ?? null
    ),
  },
  instagram: {
    parsePostId: ({ pathname }) => pathname.match(/\/(?:p|reel)\/([\w-]+)/)?.[1] ?? null,
  },
  tiktok: {
    parsePostId: ({ pathname }) => pathname.match(/\/video\/(\d+)/)?.[1] ?? null,
  },
  youtube: {
    parsePostId: (url) => {
      const watchId = url.searchParams.get('v');
      if (watchId) return watchId;
      const shortId = url.pathname.match(/\/shorts\/([\w-]+)/)?.[1];
      if (shortId) return shortId;
      if (url.hostname === 'youtu.be') {
        return url.pathname.match(/^\/([\w-]+)/)?.[1] ?? null;
      }
      return null;
    },
  },
};

export function getBackgroundPlatformStrategy(platform: PlatformId): BackgroundPlatformStrategy {
  return backgroundPlatformStrategies[platform];
}

export function extractPostId(platform: PlatformId, rawUrl: string | undefined): string | null {
  if (!rawUrl) return null;
  try {
    return getBackgroundPlatformStrategy(platform).parsePostId(new URL(rawUrl));
  } catch {
    return null;
  }
}

/**
 * 設定された API credentials / session があれば登録済み API strategy で投稿する。
 * strategy 未登録または credentials 不在なら、post action 前の DOM path 選択へ戻す。
 */
export async function tryApiPath(
  platform: PlatformId,
  text: string,
  images?: ImageAttachment[],
  cw?: string,
  visibility?: ApiPostingVisibility,
  replyToUrl?: string,
): Promise<ApiPostResult | 'no-credentials'> {
  const strategy = getBackgroundPlatformStrategy(platform).apiPost;
  if (!strategy) return 'no-credentials';
  return await strategy({ text, images, cw, visibility, replyToUrl });
}
