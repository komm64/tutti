import type { PlatformId } from '../messages';
import type { PlatformAdapter } from './types';
import { xAdapter } from './x';

/** 全プラットフォームのアダプタ登録簿。新 SNS 追加時はここに足す */
export const adapters: Record<PlatformId, PlatformAdapter | undefined> = {
  x: xAdapter,
  bluesky: undefined,
  threads: undefined,
  mastodon: undefined,
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
