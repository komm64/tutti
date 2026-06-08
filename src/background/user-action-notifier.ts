import type { PlatformId } from '../messages';
import { log } from '../utils/logger';
import { t } from '../utils/i18n';

export interface UserActionNotifier {
  notify(platform: PlatformId, reason: 'captcha' | 'confirmation', tabId: number): Promise<void>;
  handleNotificationClick(notificationId: string): boolean;
}

export function createUserActionNotifier(): UserActionNotifier {
  const notificationTabs = new Map<string, number>();

  async function focusTab(tabId: number): Promise<void> {
    try {
      const tab = await browser.tabs.get(tabId);
      await browser.tabs.update(tabId, { active: true });
      if (typeof tab.windowId === 'number') {
        await browser.windows.update(tab.windowId, { focused: true });
      }
    } catch (e) {
      log.warn(`focus user-action tab failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return {
    async notify(platform, reason, tabId): Promise<void> {
      await focusTab(tabId);
      const notificationId = `tutti-user-action:${platform}:${reason}:${Date.now()}`;
      notificationTabs.set(notificationId, tabId);
      const getUrl = browser.runtime.getURL as (path: string) => string;
      try {
        await browser.notifications.create(notificationId, {
          type: 'basic',
          iconUrl: getUrl('icon/128.png'),
          title: t('userActionRequiredNotifyTitle'),
          message: t(reason === 'captcha' ? 'userActionRequiredCaptcha' : 'userActionRequiredConfirmation', platform),
          requireInteraction: true,
        });
      } catch (e) {
        log.warn(`user-action notification failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    },
    handleNotificationClick(notificationId): boolean {
      const tabId = notificationTabs.get(notificationId);
      if (tabId === undefined) return false;
      notificationTabs.delete(notificationId);
      void focusTab(tabId);
      void browser.notifications.clear(notificationId);
      return true;
    },
  };
}
