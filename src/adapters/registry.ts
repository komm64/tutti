import type { PlatformId } from '../messages';
import type { PlatformAdapter } from './types';
import { blueskyAdapter } from './bluesky';
import { mastodonAdapter } from './mastodon';
import { threadsAdapter } from './threads';
import { xAdapter } from './x';

/** 全プラットフォームのアダプタ登録簿。新 SNS 追加時はここに足す */
export const adapters: Record<PlatformId, PlatformAdapter | undefined> = {
  x: xAdapter,
  bluesky: blueskyAdapter,
  threads: threadsAdapter,
  mastodon: mastodonAdapter,
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
