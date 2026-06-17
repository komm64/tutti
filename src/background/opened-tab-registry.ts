import type { PlatformId, PostResultMessage } from '../messages';
import { log } from '../utils/logger';
import { closeTabSafely } from './tab-management';

export interface OpenedTabRegistry {
  clear(): void;
  record(platform: PlatformId, tabId: number): void;
  forget(platform: PlatformId, tabId: number): void;
  cleanup(results: readonly PostResultMessage[]): Promise<void>;
}

export function createOpenedTabRegistry(): OpenedTabRegistry {
  const openedTabsByPlatform: Map<PlatformId, Set<number>> = new Map();

  return {
    clear(): void {
      openedTabsByPlatform.clear();
    },
    record(platform, tabId): void {
      let set = openedTabsByPlatform.get(platform);
      if (!set) {
        set = new Set();
        openedTabsByPlatform.set(platform, set);
      }
      set.add(tabId);
    },
    forget(platform, tabId): void {
      const set = openedTabsByPlatform.get(platform);
      if (!set) return;
      set.delete(tabId);
      if (set.size === 0) openedTabsByPlatform.delete(platform);
    },
    async cleanup(results): Promise<void> {
      try {
        for (const result of results) {
          if (!shouldCloseOwnedTabs(result)) continue;
          const set = openedTabsByPlatform.get(result.platform);
          if (!set) continue;
          for (const tabId of set) {
            await closeTabSafely(tabId);
          }
          openedTabsByPlatform.delete(result.platform);
        }
        for (const result of results) {
          if (!result.success) openedTabsByPlatform.delete(result.platform);
        }
      } catch (e) {
        log.warn(`cleanupOpenedTabs failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    },
  };
}

function shouldCloseOwnedTabs(result: PostResultMessage): boolean {
  if (result.preview) return false;
  if (result.success) return true;
  return result.uncertain === true || result.userAction === 'check-post-before-retry';
}
