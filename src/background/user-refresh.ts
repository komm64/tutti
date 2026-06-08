import type { PlatformAdapter } from '../adapters/types';
import { adapters } from '../adapters/registry';
import { log } from '../utils/logger';

export interface UserRefreshBroadcaster {
  broadcast(): void;
}

export function createUserRefreshBroadcaster(throttleMs = 5000): UserRefreshBroadcaster {
  let lastBroadcastRefreshAt = 0;

  return {
    broadcast(): void {
      const now = Date.now();
      if (now - lastBroadcastRefreshAt < throttleMs) {
        log.debug(`BROADCAST_REFRESH_USERS throttled (last ${Math.round((now - lastBroadcastRefreshAt) / 1000)}s ago)`);
        return;
      }
      lastBroadcastRefreshAt = now;
      void (async () => {
        const tabs = await browser.tabs.query({});
        const adapterList = Object.values(adapters).filter(
          (adapter): adapter is PlatformAdapter => adapter !== undefined,
        );
        for (const tab of tabs) {
          if (typeof tab.id !== 'number' || !tab.url) continue;
          const matched = adapterList.find((adapter) => adapter.matchUrl(tab.url!));
          if (!matched) continue;
          browser.tabs.sendMessage(tab.id, { type: 'REFRESH_USER' }).catch(() => { /* ignore */ });
        }
      })();
    },
  };
}
