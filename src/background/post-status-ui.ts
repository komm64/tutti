import { t } from '../utils/i18n';
import { log } from '../utils/logger';

/**
 * v0.4.97: 投稿中の progress badge。 完了数 / 全体 を icon に重ねる
 * (色は in-progress = 青)。 PLATFORM_PROGRESS broadcast の度に呼ばれる。
 */
export function updateProgressBadge(done: number, total: number): void {
  if (total <= 0) return;
  void browser.action.setBadgeText({ text: `${done}/${total}` });
  void browser.action.setBadgeBackgroundColor({ color: '#3b82f6' });
}

/**
 * 投稿後の badge 表示 (v0.4.80〜)。
 * v0.4.96: badge は popup を開く / 次の投稿開始まで持続させる。
 */
export function summarizeResults(results: { success: boolean; uncertain?: boolean }[]): {
  succeeded: number;
  uncertain: number;
  failed: number;
} {
  return {
    succeeded: results.filter((result) => result.success).length,
    uncertain: results.filter((result) => result.uncertain).length,
    failed: results.filter((result) => !result.success && !result.uncertain).length,
  };
}

export function notifyResults(results: { platform: string; success: boolean; uncertain?: boolean; error?: string }[]): void {
  const succeeded = results.filter((result) => result.success);
  const uncertain = results.filter((result) => result.uncertain);
  const failed = results.filter((result) => !result.success && !result.uncertain);

  if (failed.length === 0 && uncertain.length === 0 && succeeded.length > 0) {
    void browser.action.setBadgeText({ text: 'OK' });
    void browser.action.setBadgeBackgroundColor({ color: '#10b981' });
  } else if (failed.length > 0 && succeeded.length === 0 && uncertain.length === 0) {
    void browser.action.setBadgeText({ text: 'NG' });
    void browser.action.setBadgeBackgroundColor({ color: '#ef4444' });
  } else {
    void browser.action.setBadgeText({
      text: `${succeeded.length}/${results.length}`,
    });
    void browser.action.setBadgeBackgroundColor({ color: '#f59e0b' });
  }

  const parts = [
    t('completionNotifySucceeded', succeeded.length),
    uncertain.length > 0 ? t('completionNotifyUncertain', uncertain.length) : '',
    failed.length > 0 ? t('completionNotifyFailed', failed.length) : '',
  ].filter(Boolean);
  const getUrl = browser.runtime.getURL as (path: string) => string;
  void browser.notifications.create(`tutti-completion:${Date.now()}`, {
    type: 'basic',
    iconUrl: getUrl('icon/128.png'),
    title: t('completionNotifyTitle'),
    message: parts.join(' / '),
  }).catch((e) => log.warn(`completion notification failed: ${e instanceof Error ? e.message : String(e)}`));

  for (const result of results) {
    if (result.success) {
      log.info(`✓ ${result.platform}`);
    } else if (result.uncertain) {
      log.warn(`? ${result.platform}: ${result.error ?? '(no detail)'}`);
    } else {
      log.error(`✗ ${result.platform}: ${result.error ?? '(no detail)'}`);
    }
  }
}

export function clearBadge(): void {
  void browser.action.setBadgeText({ text: '' });
}
