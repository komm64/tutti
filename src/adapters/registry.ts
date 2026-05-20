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

// browser.i18n.getMessage は MV3 の全 context (popup / background / content) で動作。
// fallback は messages.json が読めない環境 (vitest 等) 向けの key literal。
function t(key: string, subs: (string | number)[] = []): string {
  try {
    const s = (globalThis as { browser?: { i18n?: { getMessage: (k: string, s: string[]) => string } } })
      .browser?.i18n?.getMessage(key, subs.map(String));
    if (s) return s;
  } catch {
    // browser.i18n が無い test 環境
  }
  return key;
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
  if (!adapter) return t('constraintAdapterMissing');
  if (!adapter.videoConstraints) return t('constraintVideoUnsupported');

  const { maxDurationS, maxBytes } = adapter.videoConstraints;
  if (maxDurationS > 0 && durationS > maxDurationS) {
    return t('constraintVideoTooLong', [maxDurationS, Math.round(durationS)]);
  }
  if (maxBytes > 0 && bytes > maxBytes) {
    const limitMB = Math.round(maxBytes / 1024 / 1024);
    const actualMB = Math.round(bytes / 1024 / 1024);
    return t('constraintVideoTooLarge', [limitMB, actualMB]);
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
  if (!adapter) return t('constraintAdapterMissing');

  const { maxBytesPerImage, maxImages } = adapter.imageConstraints;
  if (imageSizes.length > maxImages) {
    return t('constraintTooManyImages', [maxImages]);
  }
  for (let i = 0; i < imageSizes.length; i++) {
    if (imageSizes[i]! > maxBytesPerImage) {
      const limitMB = (maxBytesPerImage / 1024 / 1024).toFixed(1);
      const actualMB = (imageSizes[i]! / 1024 / 1024).toFixed(1);
      return t('constraintImageTooLarge', [i + 1, limitMB, actualMB]);
    }
  }
  return null;
}
