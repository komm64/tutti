/**
 * SNS タブの open / focus / load 待ち (v0.4.80〜、 元 background.ts から切り出し)。
 *
 * tutti-issues#16 で発覚した tab load race を polling + onUpdated listener の
 * 二重 strategy で解消した実装。 SPA で同一 URL に navigate するケース等、
 * 'complete' event が flaky な場面でも timeout する。
 */

import { log } from '../utils/logger';
import { t } from '../utils/i18n';
import { retryTransientTabAction } from './tab-action-retry';

/** 既存 / 新規どちらでも、 tab 内 content script の準備が整うまでの猶予 */
const READY_DELAY_MS = 100;
/** waitForTabComplete の上限 */
const TAB_LOAD_TIMEOUT_MS = 15000;
const DEFAULT_LOAD_RETRY_DELAY_MS = 1000;

export interface OpenOrFocusTabOptions {
  /**
   * false の場合、既存のSNSタブを再利用せずに必ず新規 compose タブを作る。
   * preview で残った下書き・wizard 状態を real post が踏む事故を避けるため、
   * real posting flow からは false を渡す。
   */
  reuseExistingTab?: boolean;
  /** 投稿ボタン click 前の load wait だけを再試行する。click 後 retry は caller 側で扱う。 */
  loadRetries?: number;
  loadRetryDelayMs?: number;
  /**
   * URL の query が SNS 側で正規化/消費されても、同じ compose route なら ready とみなす。
   * URL prefill に依存しない DOM injection 系のSNSだけで使う。
   */
  relaxedComposeUrlReady?: boolean;
}

class PageLoadTimeoutError extends Error {
  constructor() {
    super(t('runtimeSnsPageLoadTimeout'));
    this.name = 'PageLoadTimeoutError';
  }
}

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
  options: OpenOrFocusTabOptions = {},
): Promise<OpenTabResult> {
  const reuseExistingTab = options.reuseExistingTab !== false;
  const existing = reuseExistingTab
    ? (await browser.tabs.query({})).find(
      (t) => typeof t.url === 'string' && matchUrl(t.url),
    )
    : undefined;

  if (existing && typeof existing.id === 'number') {
    const existingTabId = existing.id;
    if (existing.url === composeUrl) {
      if (active) {
        await retryTransientTabAction('activate existing SNS tab', () => (
          browser.tabs.update(existingTabId, { active: true })
        ));
        if (typeof existing.windowId === 'number') {
          await retryTransientTabAction('focus existing SNS window', () => (
            browser.windows.update(existing.windowId, { focused: true })
          ));
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
    const updated = await retryTransientTabAction('navigate existing SNS tab', () => (
      browser.tabs.update(existingTabId, {
        url: composeUrl,
        active,
      })
    ));
    if (!updated) {
      throw new Error(t('runtimeExistingSnsTabUnavailable'));
    }
    if (active && typeof existing.windowId === 'number') {
      await retryTransientTabAction('focus existing SNS window', () => (
        browser.windows.update(existing.windowId, { focused: true })
      ));
    }
    await retryPreSubmitLoadWait(
      () => waitForTabUrlReady(existingTabId, composeUrl, options.relaxedComposeUrlReady === true),
      options,
      () => retryTransientTabAction('retry SNS tab navigation', () => (
        browser.tabs.update(existingTabId, { url: composeUrl, active })
      )),
    );
    const readyTab = await browser.tabs.get(existingTabId);
    await sleep(READY_DELAY_MS);
    return { tab: readyTab, wasCreated: false };
  }

  // 新規タブ作成は create + waitForTabComplete の順で OK
  // (create 時点では tab は loading state 確定で event が必ず来る)
  const created = await retryTransientTabAction('create SNS tab', () => (
    browser.tabs.create({ url: composeUrl, active })
  ));
  if (typeof created.id !== 'number') {
    throw new Error(t('runtimeSnsTabOpenFailed'));
  }
  const createdTabId = created.id;
  await retryPreSubmitLoadWait(
    () => waitForTabComplete(createdTabId),
    options,
    () => retryTransientTabAction('reload SNS tab after load timeout', () => (
      browser.tabs.reload(createdTabId)
    )),
  );
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
      finish(new PageLoadTimeoutError());
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

function waitForTabUrlReady(tabId: number, expectedUrl: string, relaxedComposeUrlReady: boolean): Promise<void> {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const timer = setInterval(() => {
      browser.tabs.get(tabId).then((tab) => {
        const currentUrl = tab.url ?? tab.pendingUrl ?? '';
        if (!isTabAtExpectedComposeUrl(currentUrl, expectedUrl, relaxedComposeUrlReady)) {
          if (Date.now() - startedAt >= TAB_LOAD_TIMEOUT_MS) {
            clearInterval(timer);
            reject(new PageLoadTimeoutError());
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
            reject(new PageLoadTimeoutError());
          }
        });
      }).catch((e) => {
        clearInterval(timer);
        reject(e instanceof Error ? e : new Error(String(e)));
      });
    }, 250);
  });
}

async function retryPreSubmitLoadWait(
  wait: () => Promise<void>,
  options: OpenOrFocusTabOptions,
  retryNavigation: () => Promise<unknown>,
): Promise<void> {
  const maxRetries = Math.max(0, options.loadRetries ?? 0);
  for (let attempt = 0; ; attempt += 1) {
    try {
      await wait();
      return;
    } catch (e) {
      if (!(e instanceof PageLoadTimeoutError) || attempt >= maxRetries) throw e;
      log.warn(`SNS tab load timed out before submit; retrying navigation (${attempt + 1}/${maxRetries})`);
      await retryNavigation();
      await sleep(options.loadRetryDelayMs ?? DEFAULT_LOAD_RETRY_DELAY_MS);
    }
  }
}

export function isTabAtExpectedComposeUrl(
  currentUrl: string,
  expectedUrl: string,
  relaxedComposeUrlReady = false,
): boolean {
  if (!currentUrl) return false;
  if (currentUrl.startsWith(expectedUrl)) return true;
  if (!relaxedComposeUrlReady) return false;
  try {
    const current = new URL(currentUrl);
    const expected = new URL(expectedUrl);
    return current.origin === expected.origin &&
      normalizePath(current.pathname) === normalizePath(expected.pathname);
  } catch {
    return false;
  }
}

function normalizePath(pathname: string): string {
  return pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
