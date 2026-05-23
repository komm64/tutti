/**
 * SNS タブの open / focus / load 待ち (v0.4.80〜、 元 background.ts から切り出し)。
 *
 * tutti-issues#16 で発覚した tab load race を polling + onUpdated listener の
 * 二重 strategy で解消した実装。 SPA で同一 URL に navigate するケース等、
 * 'complete' event が flaky な場面でも timeout する。
 */

import { log } from '../utils/logger';

/** 既存 / 新規どちらでも、 tab 内 content script の準備が整うまでの猶予 */
const READY_DELAY_MS = 800;
/** waitForTabComplete の上限 */
const TAB_LOAD_TIMEOUT_MS = 15000;

export async function openOrFocusTab(
  composeUrl: string,
  matchUrl: (url: string) => boolean,
  active: boolean,
): Promise<Browser.tabs.Tab> {
  const existing = (await browser.tabs.query({})).find(
    (t) => typeof t.url === 'string' && matchUrl(t.url),
  );

  if (existing && typeof existing.id === 'number') {
    // v0.4.70: 既存タブが既に target URL と同じ場合 (SPA 内部 navigation 等) は
    // tabs.update が 'loading'→'complete' を再発火させないことがあり、
    // waitForTabComplete が listener 起動前に complete event を取り逃して 15s
    // タイムアウトする race を引き起こしていた (tutti-issues#16)。
    // listener を先に install してから tabs.update する + 既に complete なら
    // 即時 resolve する dual-strategy で解消。
    const waitPromise = waitForTabComplete(existing.id);
    const updated = await browser.tabs.update(existing.id, {
      url: composeUrl,
      active,
    });
    if (!updated) {
      throw new Error('既存の SNS タブを操作できませんでした');
    }
    if (active && typeof existing.windowId === 'number') {
      await browser.windows.update(existing.windowId, { focused: true });
    }
    await waitPromise;
    await sleep(READY_DELAY_MS);
    return updated;
  }

  // 新規タブ作成は create + waitForTabComplete の順で OK
  // (create 時点では tab は loading state 確定で event が必ず来る)
  const created = await browser.tabs.create({ url: composeUrl, active });
  if (typeof created.id !== 'number') {
    throw new Error('SNS タブを開けませんでした');
  }
  await waitForTabComplete(created.id);
  await sleep(READY_DELAY_MS);
  return created;
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
      finish(new Error('SNS ページの読み込みがタイムアウトしました(回線か SNS の状態を確認)'));
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
export function notifyResults(results: { platform: string; success: boolean; error?: string }[]): void {
  const succeeded = results.filter((r) => r.success);
  const failed = results.filter((r) => !r.success);

  if (failed.length === 0 && succeeded.length > 0) {
    void browser.action.setBadgeText({ text: 'OK' });
    void browser.action.setBadgeBackgroundColor({ color: '#10b981' });
  } else if (succeeded.length === 0) {
    void browser.action.setBadgeText({ text: 'NG' });
    void browser.action.setBadgeBackgroundColor({ color: '#ef4444' });
  } else {
    void browser.action.setBadgeText({
      text: `${succeeded.length}/${results.length}`,
    });
    void browser.action.setBadgeBackgroundColor({ color: '#f59e0b' });
  }

  // 完了 OS 通知。 全成功なら緑系、 失敗ありなら赤系。
  // 失敗 SNS 名を body に列挙して user が 「どこで失敗したか」 を一目で分かる。
  void showCompletionNotification(succeeded.length, failed);

  for (const r of results) {
    if (r.success) {
      log.info(`✓ ${r.platform}`);
    } else {
      log.error(`✗ ${r.platform}: ${r.error ?? '(no detail)'}`);
    }
  }
}

const PLATFORM_LABELS: Record<string, string> = {
  x: 'X', bluesky: 'Bluesky', threads: 'Threads', mastodon: 'Mastodon',
  misskey: 'Misskey', tumblr: 'Tumblr', pixiv: 'Pixiv', deviantart: 'DeviantArt',
  instagram: 'Instagram', tiktok: 'TikTok', youtube: 'YouTube',
};

async function showCompletionNotification(
  succeeded: number,
  failed: { platform: string; error?: string }[],
): Promise<void> {
  try {
    // notifications permission が無い環境 (古い build / 拒否済) では silently skip
    if (!browser.notifications?.create) return;
    const total = succeeded + failed.length;
    const iconUrl = browser.runtime.getURL('/icon/128.png');
    const isAllSuccess = failed.length === 0;
    const title = isAllSuccess
      ? `Tutti: ${total} SNS に投稿しました`
      : `Tutti: ${succeeded}/${total} 成功、 ${failed.length} 失敗`;
    const failedNames = failed
      .map((f) => PLATFORM_LABELS[f.platform] ?? f.platform)
      .join(', ');
    const message = isAllSuccess
      ? '全 SNS に正常投稿されました'
      : `失敗: ${failedNames}\nTutti を開いて再送できます`;
    await browser.notifications.create('tutti-post-complete-' + Date.now(), {
      type: 'basic',
      iconUrl,
      title,
      message,
      priority: isAllSuccess ? 0 : 2,
    });
  } catch (e) {
    log.warn(`完了通知失敗: ${e instanceof Error ? e.message : String(e)}`);
  }
}

export function clearBadge(): void {
  void browser.action.setBadgeText({ text: '' });
}
