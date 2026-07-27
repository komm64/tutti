import type { ImageAttachment } from '../messages';
import type { ApiPostResult } from '../api/types';
import type { PlatformId } from '../types/platform';
import {
  verifyError,
  type VerifyExpectation,
  type VerifyResult,
} from '../utils/post-verify';
import {
  tryBlueskyApiPost,
  tryMastodonApiPost,
  tryMisskeyApiPost,
  type ApiPostingStrategy,
  type ApiPostingVisibility,
} from './api-posting';
import {
  verifyBlueskyPost,
  verifyDeviantArtPost,
  verifyInstagramPost,
  verifyMastodonPost,
  verifyMisskeyPost,
  verifyPixivPost,
  verifyThreadsPost,
  verifyTikTokPost,
  verifyTumblrPost,
  verifyXPost,
  verifyYouTubePost,
  type VerificationStrategy,
} from './verify-dispatcher';
import {
  capturePostUrlFromTabWithRetry as capturePostUrlWithGenericFlow,
  type CapturePostUrlOptions,
} from './post-url-capture';
import { extractHttpUrls } from '../utils/text-urls';

export type PostUrlCaptureStrategy = (
  options: CapturePostUrlOptions,
) => Promise<string | undefined>;

export interface BackgroundPlatformStrategy {
  /** 投稿 URL から platform 固有の安定 post ID を抽出する。 */
  parsePostId: (url: URL) => string | null;
  /** credentials / borrowed session がある場合だけ使う API posting 手続き。 */
  apiPost?: ApiPostingStrategy;
  /** API posting strategyがreply URLをthread continuationとして処理できる。 */
  apiReplyContinuation?: true;
  /** 複数chunkを1つのcompose surfaceへまとめるplatform固有policy。 */
  inlineThread?: {
    shouldUse: (autoPost: boolean) => boolean;
    forceForegroundPreview?: true;
  };
  /** 2 chunk 目以降を captured parent URL へ接続する compose URL 手続き。 */
  continuationUrl?: (previousPostUrl: string) => string | undefined;
  /** media kindに応じてadapter既定値を置き換えるcompose URL手続き。 */
  resolveComposeUrl?: (
    defaultUrl: string,
    attachments?: readonly ImageAttachment[],
  ) => string;
  /** verification時に本文から追加で期待するURLを構築する。 */
  expectedUrls?: (text: string) => string[];
  /** 投稿後 URL と期待値を照合する verification 手続き。 */
  verifyPost?: VerificationStrategy;
  /** 投稿後に platform 固有の post URL を取得する手続き。 */
  capturePostUrl?: PostUrlCaptureStrategy;
}

/**
 * background 固有の platform 手続きを集約する registry。
 * 新 platform は adapter registry と同時に必ずここへ登録する。
 */
export const backgroundPlatformStrategies: Record<PlatformId, BackgroundPlatformStrategy> = {
  x: {
    parsePostId: ({ pathname }) => pathname.match(/\/status(?:es)?\/(\d+)/)?.[1] ?? null,
    inlineThread: {
      // X の複数投稿は preview / 本投稿とも compose 上で全件を組み立て、
      // 最後に "Post all" を 1 回だけ実行する。
      shouldUse: () => true,
      forceForegroundPreview: true,
    },
    verifyPost: verifyXPost,
    capturePostUrl: capturePostUrlWithGenericFlow,
  },
  bluesky: {
    parsePostId: ({ pathname }) => pathname.match(/\/post\/([a-zA-Z0-9]+)/)?.[1] ?? null,
    apiPost: tryBlueskyApiPost,
    inlineThread: {
      shouldUse: () => true,
    },
    verifyPost: verifyBlueskyPost,
    capturePostUrl: capturePostUrlWithGenericFlow,
  },
  threads: {
    parsePostId: ({ pathname }) => pathname.match(/\/post\/([A-Za-z0-9_-]+)/)?.[1] ?? null,
    continuationUrl: (previousPostUrl) => previousPostUrl,
    verifyPost: verifyThreadsPost,
    capturePostUrl: capturePostUrlWithGenericFlow,
  },
  mastodon: {
    parsePostId: ({ pathname }) => (
      pathname.match(/\/@[\w@.-]+\/(\d+)/)?.[1]
      ?? pathname.match(/\/users\/\w+\/statuses\/(\d+)/)?.[1]
      ?? null
    ),
    apiPost: tryMastodonApiPost,
    apiReplyContinuation: true,
    continuationUrl: (previousPostUrl) => previousPostUrl,
    verifyPost: verifyMastodonPost,
    capturePostUrl: capturePostUrlWithGenericFlow,
  },
  misskey: {
    parsePostId: ({ pathname }) => pathname.match(/\/notes\/([a-zA-Z0-9]+)/)?.[1] ?? null,
    apiPost: tryMisskeyApiPost,
    verifyPost: verifyMisskeyPost,
    capturePostUrl: capturePostUrlWithGenericFlow,
  },
  tumblr: {
    parsePostId: ({ pathname }) => (
      pathname.match(/\/post\/(\d+)/)?.[1]
      ?? pathname.match(/^\/[^/]+\/(\d+)(?:\/|$)/)?.[1]
      ?? null
    ),
    resolveComposeUrl: (defaultUrl, attachments) => (
      attachments?.some((attachment) => attachment.type.startsWith('video/'))
        ? 'https://www.tumblr.com/new/video'
        : defaultUrl
    ),
    expectedUrls: extractHttpUrls,
    verifyPost: verifyTumblrPost,
    capturePostUrl: capturePostUrlWithGenericFlow,
  },
  pixiv: {
    parsePostId: ({ pathname }) => pathname.match(/\/artworks\/(\d+)/)?.[1] ?? null,
    verifyPost: verifyPixivPost,
    capturePostUrl: capturePostUrlWithGenericFlow,
  },
  deviantart: {
    parsePostId: ({ pathname }) => (
      pathname.match(/-(\d+)\/?$/)?.[1]
      ?? pathname.match(/\/art\/(\d+)\/?$/)?.[1]
      ?? null
    ),
    verifyPost: verifyDeviantArtPost,
    capturePostUrl: capturePostUrlWithGenericFlow,
  },
  instagram: {
    parsePostId: ({ pathname }) => pathname.match(/\/(?:p|reel)\/([\w-]+)/)?.[1] ?? null,
    verifyPost: verifyInstagramPost,
    capturePostUrl: capturePostUrlWithGenericFlow,
  },
  tiktok: {
    parsePostId: ({ pathname }) => pathname.match(/\/video\/(\d+)/)?.[1] ?? null,
    verifyPost: verifyTikTokPost,
    capturePostUrl: capturePostUrlWithGenericFlow,
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
    verifyPost: verifyYouTubePost,
    capturePostUrl: capturePostUrlWithGenericFlow,
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

export function continuationNeedsReplyUrl(platform: PlatformId): boolean {
  return getBackgroundPlatformStrategy(platform).continuationUrl !== undefined;
}

export function shouldUseInlineThread(platform: PlatformId, autoPost: boolean): boolean {
  return getBackgroundPlatformStrategy(platform).inlineThread?.shouldUse(autoPost) === true;
}

export function canUseApiWithReplyUrl(
  platform: PlatformId,
  replyToUrl: string | undefined,
): boolean {
  return !!replyToUrl && getBackgroundPlatformStrategy(platform).apiReplyContinuation === true;
}

export function buildReplyOverrideUrl(
  platform: PlatformId,
  chunkIndex: number,
  previousPostUrl: string | undefined,
): string | undefined {
  if (chunkIndex === 0 || !previousPostUrl) return undefined;
  return getBackgroundPlatformStrategy(platform).continuationUrl?.(previousPostUrl);
}

export function resolveComposeUrlForMedia(
  platform: PlatformId,
  defaultUrl: string,
  attachments?: readonly ImageAttachment[],
): string {
  return getBackgroundPlatformStrategy(platform).resolveComposeUrl?.(defaultUrl, attachments)
    ?? defaultUrl;
}

export function shouldForceInlineThreadPreviewForeground(
  platform: PlatformId,
  dryRun: boolean,
  textChunks?: readonly string[],
): boolean {
  const inlineThread = getBackgroundPlatformStrategy(platform).inlineThread;
  return dryRun
    && inlineThread?.forceForegroundPreview === true
    && !!textChunks
    && textChunks.length > 1;
}

export function buildExpectedUrlsForVerification(
  platform: PlatformId,
  text: string,
): string[] {
  return getBackgroundPlatformStrategy(platform).expectedUrls?.(text) ?? [];
}

export function isVerifySupported(platform: PlatformId): boolean {
  return getBackgroundPlatformStrategy(platform).verifyPost !== undefined;
}

export async function runVerify(
  platform: PlatformId,
  postUrl: string,
  expected: VerifyExpectation,
): Promise<VerifyResult> {
  const strategy = getBackgroundPlatformStrategy(platform).verifyPost;
  if (!strategy) return verifyError(`${platform}: verification strategy unavailable`);
  return await strategy(postUrl, expected);
}

export function isPostUrlCaptureSupported(platform: PlatformId): boolean {
  return getBackgroundPlatformStrategy(platform).capturePostUrl !== undefined;
}

export async function capturePostUrlFromTabWithRetry(
  options: CapturePostUrlOptions,
): Promise<string | undefined> {
  const strategy = getBackgroundPlatformStrategy(options.platform).capturePostUrl;
  if (!strategy) return undefined;
  return await strategy(options);
}
