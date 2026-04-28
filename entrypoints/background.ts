import type {
  Message,
  PlatformId,
  PostResultMessage,
  PostToPlatformMessage,
} from '../src/messages';
import { getAdapter } from '../src/adapters/registry';

const READY_DELAY_MS = 800;
const TAB_LOAD_TIMEOUT_MS = 15000;

export default defineBackground(() => {
  console.log('[Tutti] background started', { id: browser.runtime.id });

  browser.runtime.onMessage.addListener((rawMsg, _sender, sendResponse) => {
    const msg = rawMsg as Message;
    if (msg.type !== 'POST_REQUEST') return;

    void handlePostRequest(msg.text, msg.platforms)
      .then((results) => sendResponse({ results }))
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        sendResponse({ error: message });
      });

    return true;
  });
});

async function handlePostRequest(
  text: string,
  platforms: PlatformId[],
): Promise<PostResultMessage[]> {
  const results = await Promise.all(
    platforms.map((platform) => postToPlatform(platform, text)),
  );

  notifyResults(results);
  return results;
}

async function postToPlatform(
  platform: PlatformId,
  text: string,
): Promise<PostResultMessage> {
  const adapter = getAdapter(platform);
  if (!adapter) {
    return {
      type: 'POST_RESULT',
      platform,
      success: false,
      error: `${platform} のアダプタは未実装です`,
    };
  }

  try {
    const tab = await openOrFocusTab(adapter.composeUrl, adapter.matchUrl);
    if (typeof tab.id !== 'number') {
      throw new Error('対象タブの ID が取得できませんでした');
    }

    const message: PostToPlatformMessage = {
      type: 'POST_TO_PLATFORM',
      platform,
      text,
    };
    const response = (await browser.tabs.sendMessage(
      tab.id,
      message,
    )) as PostResultMessage | undefined;

    if (!response) {
      throw new Error('content script からの応答がありませんでした');
    }
    return response;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      type: 'POST_RESULT',
      platform,
      success: false,
      error: message,
    };
  }
}

async function openOrFocusTab(
  composeUrl: string,
  matchUrl: (url: string) => boolean,
): Promise<Browser.tabs.Tab> {
  // 既存タブで対象 URL と一致するものがあれば、そのタブを compose URL に遷移
  const existing = (await browser.tabs.query({})).find(
    (t) => typeof t.url === 'string' && matchUrl(t.url),
  );

  if (existing && typeof existing.id === 'number') {
    const updated = await browser.tabs.update(existing.id, {
      url: composeUrl,
      active: true,
    });
    if (!updated) {
      throw new Error('既存タブの URL 更新に失敗しました');
    }
    if (typeof existing.windowId === 'number') {
      await browser.windows.update(existing.windowId, { focused: true });
    }
    await waitForTabComplete(existing.id);
    await sleep(READY_DELAY_MS);
    return updated;
  }

  const created = await browser.tabs.create({ url: composeUrl, active: true });
  if (typeof created.id !== 'number') {
    throw new Error('新規タブの作成に失敗しました');
  }
  await waitForTabComplete(created.id);
  await sleep(READY_DELAY_MS);
  return created;
}

function waitForTabComplete(tabId: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      browser.tabs.onUpdated.removeListener(listener);
      reject(new Error('タブのロードがタイムアウトしました'));
    }, TAB_LOAD_TIMEOUT_MS);

    const listener = (
      updatedId: number,
      info: Browser.tabs.OnUpdatedInfo,
    ): void => {
      if (updatedId === tabId && info.status === 'complete') {
        browser.tabs.onUpdated.removeListener(listener);
        clearTimeout(timer);
        resolve();
      }
    };
    browser.tabs.onUpdated.addListener(listener);
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function notifyResults(results: PostResultMessage[]): void {
  const succeeded = results.filter((r) => r.success);
  const failed = results.filter((r) => !r.success);

  // 拡張アイコンにバッジを出して即時フィードバック(P8 で notifications API へ置換予定)
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
  setTimeout(() => void browser.action.setBadgeText({ text: '' }), 5000);

  for (const r of results) {
    if (r.success) {
      console.log(`[Tutti] ✓ ${r.platform}`);
    } else {
      console.error(`[Tutti] ✗ ${r.platform}: ${r.error ?? '(no detail)'}`);
    }
  }
}
