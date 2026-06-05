/**
 * SNS タブの open / focus / load 待ち (v0.4.80〜、 元 background.ts から切り出し)。
 *
 * tutti-issues#16 で発覚した tab load race を polling + onUpdated listener の
 * 二重 strategy で解消した実装。 SPA で同一 URL に navigate するケース等、
 * 'complete' event が flaky な場面でも timeout する。
 */

import { log } from '../utils/logger';
import { t } from '../utils/i18n';

/** 既存 / 新規どちらでも、 tab 内 content script の準備が整うまでの猶予 */
const READY_DELAY_MS = 100;
/** waitForTabComplete の上限 */
const TAB_LOAD_TIMEOUT_MS = 15000;

/**
 * v0.5.7〜 戻り値が `{ tab, wasCreated }` に変更。 wasCreated は 「この呼び出しで
 * Tutti が新規に open したタブか」 を示す。 投稿成功後に Tutti 作成タブのみを
 * close する判定 (closeOpenedTabIfSafe) に使う。 user が元々開いていた SNS タブを
 * 勝手に閉じる事故を回避するため。
 */
export interface OpenTabResult {
  tab: Browser.tabs.Tab;
  wasCreated: boolean;
}

export async function openOrFocusTab(
  composeUrl: string,
  matchUrl: (url: string) => boolean,
  active: boolean,
): Promise<OpenTabResult> {
  const existing = (await browser.tabs.query({})).find(
    (t) => typeof t.url === 'string' && matchUrl(t.url),
  );

  if (existing && typeof existing.id === 'number') {
    if (existing.url === composeUrl) {
      if (active) {
        await browser.tabs.update(existing.id, { active: true });
        if (typeof existing.windowId === 'number') {
          await browser.windows.update(existing.windowId, { focused: true });
        }
      }
      await sleep(READY_DELAY_MS);
      return { tab: existing, wasCreated: false };
    }
    // v0.4.70: 既存タブが既に target URL と同じ場合 (SPA 内部 navigation 等) は
    // tabs.update が 'loading'→'complete' を再発火させないことがあり、
    // waitForTabComplete が listener 起動前に complete event を取り逃して 15s
    // タイムアウトする race を引き起こしていた (tutti-issues#16)。
    // listener を先に install してから tabs.update する + 既に complete なら
    // 即時 resolve する dual-strategy で解消。
    const updated = await browser.tabs.update(existing.id, {
      url: composeUrl,
      active,
    });
    if (!updated) {
      throw new Error(t('runtimeExistingSnsTabUnavailable'));
    }
    if (active && typeof existing.windowId === 'number') {
      await browser.windows.update(existing.windowId, { focused: true });
    }
    await waitForTabUrlReady(existing.id, composeUrl);
    const readyTab = await browser.tabs.get(existing.id);
    await sleep(READY_DELAY_MS);
    return { tab: readyTab, wasCreated: false };
  }

  // 新規タブ作成は create + waitForTabComplete の順で OK
  // (create 時点では tab は loading state 確定で event が必ず来る)
  const created = await browser.tabs.create({ url: composeUrl, active });
  if (typeof created.id !== 'number') {
    throw new Error(t('runtimeSnsTabOpenFailed'));
  }
  await waitForTabComplete(created.id);
  await sleep(READY_DELAY_MS);
  return { tab: created, wasCreated: true };
}

/**
 * v0.5.7〜 Tutti が新規 open したタブのみ閉じる (= compose 画面 / share 画面の
 * 後片付け)。 user が元から開いていた SNS タブは閉じない。
 *
 * 「post 成功後、 SNS が post URL に redirect してくれた」 ケースは tab を残す方が
 * 親切なので、 caller 側で 「URL を取れた / autoOpenPostUrl='always' で別タブで開く」
 * 判断後にこの関数を呼ぶ。
 */
export async function closeTabSafely(tabId: number): Promise<void> {
  try {
    await browser.tabs.remove(tabId);
  } catch (e) {
    log.warn(`close tab ${tabId} failed: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/**
 * tab が `status: 'complete'` になるまで待つ。 listener 取り付け前に既に
 * complete だった場合のために、 まず tabs.get で現状を polling してから
 * onUpdated listener も install する 2 重 strategy (tutti-issues#16)。
 */
export function waitForTabComplete(tabId: number): Promise<void> {
  return new Promise((resolve, reject) => {
    let done = false;
    const finish = (err?: Error): void => {
      if (done) return;
      done = true;
      browser.tabs.onUpdated.removeListener(listener);
      clearTimeout(timer);
      clearInterval(pollTimer);
      if (err) reject(err); else resolve();
    };

    const timer = setTimeout(() => {
      finish(new Error(t('runtimeSnsPageLoadTimeout')));
    }, TAB_LOAD_TIMEOUT_MS);

    const listener = (
      updatedId: number,
      info: Browser.tabs.OnUpdatedInfo,
    ): void => {
      if (updatedId === tabId && info.status === 'complete') {
        finish();
      }
    };
    browser.tabs.onUpdated.addListener(listener);

    // event を取り逃した場合のため tabs.get を 250ms 間隔で polling して
    // status==='complete' を直接確認。 listener と並走、 どちらか早い方で finish。
    const pollTimer = setInterval(() => {
      browser.tabs.get(tabId).then((t) => {
        if (t.status === 'complete') finish();
      }).catch(() => { /* ignore (tab gone, listener / timer 側で handle) */ });
      // Heavy SPA can keep chrome.tabs status at "loading" after the compose
      // document is usable. Selector-specific readiness is checked by each
      // content script, so release this generic gate once the DOM exists.
      void browser.scripting.executeScript({
        target: { tabId },
        func: () => document.readyState !== 'loading' && !!document.body,
      }).then((results) => {
        if (results[0]?.result === true) finish();
      }).catch(() => { /* ignore (restricted URL / tab not ready yet) */ });
    }, 250);
  });
}

function waitForTabUrlReady(tabId: number, expectedUrl: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const timer = setInterval(() => {
      browser.tabs.get(tabId).then((tab) => {
        const currentUrl = tab.url ?? tab.pendingUrl ?? '';
        if (!currentUrl.startsWith(expectedUrl)) {
          if (Date.now() - startedAt >= TAB_LOAD_TIMEOUT_MS) {
            clearInterval(timer);
            reject(new Error(t('runtimeSnsPageLoadTimeout')));
          }
          return;
        }
        void browser.scripting.executeScript({
          target: { tabId },
          func: () => document.readyState !== 'loading' && !!document.body,
        }).then((results) => {
          if (results[0]?.result === true) {
            clearInterval(timer);
            resolve();
          }
        }).catch(() => {
          if (Date.now() - startedAt >= TAB_LOAD_TIMEOUT_MS) {
            clearInterval(timer);
            reject(new Error(t('runtimeSnsPageLoadTimeout')));
          }
        });
      }).catch((e) => {
        clearInterval(timer);
        reject(e instanceof Error ? e : new Error(String(e)));
      });
    }, 250);
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * v0.4.97: 投稿中の progress badge。 完了数 / 全体 を icon に重ねる
 * (色は in-progress = 青)。 PLATFORM_PROGRESS broadcast の度に呼ばれる。
 */
export function updateProgressBadge(done: number, total: number): void {
  if (total <= 0) return;
  void browser.action.setBadgeText({ text: `${done}/${total}` });
  void browser.action.setBadgeBackgroundColor({ color: '#3b82f6' }); // blue
}

/**
 * 投稿後の badge 表示 (v0.4.80〜 ここに切り出し)。
 * v0.4.96: badge は popup を開く / 次の投稿開始まで持続させる
 * (旧 5s 自動消去だと user が popup を再 open するまでに結果通知が消えていた)。
 * v0.4.97: 完了通知 (chrome.notifications) も同時に出す。 黙って終わらない。
 */
export function summarizeResults(results: { success: boolean; uncertain?: boolean }[]): {
  succeeded: number;
  uncertain: number;
  failed: number;
} {
  return {
    succeeded: results.filter((r) => r.success).length,
    uncertain: results.filter((r) => r.uncertain).length,
    failed: results.filter((r) => !r.success && !r.uncertain).length,
  };
}

export function notifyResults(results: { platform: string; success: boolean; uncertain?: boolean; error?: string }[]): void {
  const succeeded = results.filter((r) => r.success);
  const uncertain = results.filter((r) => r.uncertain);
  const failed = results.filter((r) => !r.success && !r.uncertain);

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

  for (const r of results) {
    if (r.success) {
      log.info(`✓ ${r.platform}`);
    } else if (r.uncertain) {
      log.warn(`? ${r.platform}: ${r.error ?? '(no detail)'}`);
    } else {
      log.error(`✗ ${r.platform}: ${r.error ?? '(no detail)'}`);
    }
  }
}

export function clearBadge(): void {
  void browser.action.setBadgeText({ text: '' });
}
