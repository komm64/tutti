import type { PlatformId } from '../messages';
import { getAdapter } from '../adapters/registry';
import type { PlatformAdapter } from '../adapters/types';
import { getSettings } from '../storage';

/**
 * アダプタを解決する。Mastodon / Misskey はユーザー設定のインスタンス URL で
 * compose URL と URL matcher を上書きする。
 */
export async function resolveAdapter(platform: PlatformId): Promise<PlatformAdapter | undefined> {
  const adapter = getAdapter(platform);
  if (!adapter) return undefined;

  if (platform === 'mastodon') {
    const { mastodonInstance } = await getSettings();
    if (mastodonInstance !== 'https://mastodon.social') {
      return {
        ...adapter,
        matchUrl: (url) => url.startsWith(`${mastodonInstance}/`),
        getComposeUrl: (text) =>
          `${mastodonInstance}/share?text=${encodeURIComponent(text)}`,
      };
    }
  }

  if (platform === 'misskey') {
    const { misskeyInstance } = await getSettings();
    if (misskeyInstance !== 'https://misskey.io') {
      return {
        ...adapter,
        matchUrl: (url) => url.startsWith(`${misskeyInstance}/`),
        getComposeUrl: (text) =>
          `${misskeyInstance}/share?text=${encodeURIComponent(text)}`,
      };
    }
  }

  return adapter;
}
