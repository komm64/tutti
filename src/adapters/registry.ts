import type { PlatformId } from '../messages';
import type { PlatformAdapter } from './types';
import { blueskyAdapter } from './bluesky';
import { deviantartAdapter } from './deviantart';
import { instagramAdapter } from './instagram';
import { mastodonAdapter } from './mastodon';
import { misskeyAdapter } from './misskey';
import { pixivAdapter } from './pixiv';
import { threadsAdapter } from './threads';
import { tiktokAdapter } from './tiktok';
import { tumblrAdapter } from './tumblr';
import { xAdapter } from './x';
import { youtubeAdapter } from './youtube';

/** 全プラットフォームのアダプタ登録簿。新 SNS 追加時はここに足す */
export const adapters: Record<PlatformId, PlatformAdapter | undefined> = {
  x: xAdapter,
  bluesky: blueskyAdapter,
  threads: threadsAdapter,
  mastodon: mastodonAdapter,
  misskey: misskeyAdapter,
  tumblr: tumblrAdapter,
  pixiv: pixivAdapter,
  deviantart: deviantartAdapter,
  instagram: instagramAdapter,
  tiktok: tiktokAdapter,
  youtube: youtubeAdapter,
};

export function getAdapter(id: PlatformId): PlatformAdapter | undefined {
  return adapters[id];
}

export function findAdapterByUrl(url: string): PlatformAdapter | undefined {
  for (const adapter of Object.values(adapters)) {
    if (adapter?.matchUrl(url)) return adapter;
  }
  return undefined;
}

/**
 * 動画がプラットフォームの制約を満たすか確認する。
 * @returns null = OK、string = エラー理由
 */
export function checkVideoConstraint(
  id: PlatformId,
  durationS: number,
  bytes: number,
): string | null {
  const adapter = getAdapter(id);
  if (!adapter) return 'アダプタ未実装';
  if (!adapter.videoConstraints) return '動画投稿に未対応';

  const { maxDurationS, maxBytes } = adapter.videoConstraints;
  if (maxDurationS > 0 && durationS > maxDurationS) {
    return `尺が長すぎます(上限 ${maxDurationS}s、実際 ${Math.round(durationS)}s)`;
  }
  if (maxBytes > 0 && bytes > maxBytes) {
    const limitMB = Math.round(maxBytes / 1024 / 1024);
    const actualMB = Math.round(bytes / 1024 / 1024);
    return `ファイルサイズが大きすぎます(上限 ${limitMB}MB、実際 ${actualMB}MB)`;
  }
  return null;
}

/**
 * 画像群がプラットフォームの制約を満たすか確認する。
 * @returns null = OK、string = エラー理由
 */
export function checkImageConstraint(
  id: PlatformId,
  imageSizes: number[],
): string | null {
  const adapter = getAdapter(id);
  if (!adapter) return 'アダプタ未実装';

  const { maxBytesPerImage, maxImages } = adapter.imageConstraints;
  if (imageSizes.length > maxImages) {
    return `画像が多すぎます(上限 ${maxImages} 枚)`;
  }
  for (let i = 0; i < imageSizes.length; i++) {
    if (imageSizes[i]! > maxBytesPerImage) {
      const limitMB = (maxBytesPerImage / 1024 / 1024).toFixed(1);
      const actualMB = (imageSizes[i]! / 1024 / 1024).toFixed(1);
      return `${i + 1}枚目が大きすぎます(上限 ${limitMB}MB、実際 ${actualMB}MB)`;
    }
  }
  return null;
}
