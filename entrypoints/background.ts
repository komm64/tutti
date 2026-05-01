import { log } from '../src/utils/logger';
import type {
  DiagnosePlatformResult,
  ImageAttachment,
  LogEntry,
  Message,
  PlatformId,
  PostResultMessage,
  PostToPlatformMessage,
} from '../src/messages';
import {
  checkImageConstraint,
  checkVideoConstraint,
  getAdapter,
} from '../src/adapters/registry';
import type { PlatformAdapter } from '../src/adapters/types';
import { addToPostHistory, getSettings, setLastSeenUser } from '../src/storage';
import { base64ByteLength } from '../src/utils/base64';
import { fetchOverridesFrom } from '../src/utils/selector-overrides';
import { splitText } from '../src/utils/split';

const READY_DELAY_MS = 800;
const TAB_LOAD_TIMEOUT_MS = 15000;
const CHUNK_INTERVAL_MS = 2000;

// ── ログ ring buffer (任意 context からの LOG_APPEND を集約) ──────────────
//
// Tutti の全 context (popup / content scripts / inject-helper) は
// `src/utils/logger.ts` 経由で background にログを送ってくる。background は
// 直近 N 件を ring buffer で保持し、Settings からダウンロード可能にする。
// service worker が wake / sleep を繰り返しても消えないよう storage.local にも persist。

const LOG_BUFFER_KEY = 'logBuffer';
const LOG_BUFFER_MAX = 1000;
let logBuffer: LogEntry[] = [];
let logPersistTimer: ReturnType<typeof setTimeout> | undefined;

async function loadLogBuffer(): Promise<void> {
  try {
    const stored = await browser.storage.local.get(LOG_BUFFER_KEY);
    const v = stored[LOG_BUFFER_KEY] as LogEntry[] | undefined;
    if (Array.isArray(v)) logBuffer = v.slice(-LOG_BUFFER_MAX);
  } catch { /* ignore */ }
}

function persistLogBufferDebounced(): void {
  if (logPersistTimer) clearTimeout(logPersistTimer);
  logPersistTimer = setTimeout(() => {
    void browser.storage.local.set({ [LOG_BUFFER_KEY]: logBuffer }).catch(() => { /* ignore */ });
  }, 1000);
}

function appendLog(entry: LogEntry): void {
  logBuffer.push(entry);
  if (logBuffer.length > LOG_BUFFER_MAX) {
    logBuffer = logBuffer.slice(-LOG_BUFFER_MAX);
  }
  persistLogBufferDebounced();
}

export default defineBackground(() => {
  log.info('background started', { id: browser.runtime.id });
  void loadLogBuffer();

  // 拡張インストール / 起動時に selectorOverrideUrl が設定されてれば自動 fetch。
  // SNS UI が変わって Tutti 自体に新しい selector を取り込まずに済むようにする。
  void (async () => {
    try {
      const { selectorOverrideUrl } = await getSettings();
      if (selectorOverrideUrl) {
        const r = await fetchOverridesFrom(selectorOverrideUrl);
        log.info('selector overrides bootstrap fetch:', r);
      }
    } catch (e) {
      log.warn('override bootstrap failed', e);
    }
  })();

  browser.runtime.onMessage.addListener((rawMsg, _sender, sendResponse) => {
    const msg = rawMsg as Message;

    if (msg.type === 'CURRENT_USER') {
      void setLastSeenUser(msg.platform, msg.username);
      return; // fire-and-forget
    }

    if (msg.type === 'LOG_APPEND') {
      appendLog(msg.entry);
      return; // fire-and-forget
    }
    if (msg.type === 'LOG_EXPORT_REQUEST') {
      sendResponse({ entries: logBuffer.slice() });
      return true;
    }
    if (msg.type === 'LOG_CLEAR') {
      logBuffer = [];
      void browser.storage.local.remove(LOG_BUFFER_KEY).catch(() => { /* ignore */ });
      return; // fire-and-forget
    }

    if (msg.type === 'DIAGNOSE_REQUEST') {
      void handleDiagnoseRequest()
        .then((report) => sendResponse({ report }))
        .catch((err: unknown) => {
          const message = err instanceof Error ? err.message : String(err);
          sendResponse({ error: message });
        });
      return true;
    }

    if (msg.type !== 'POST_REQUEST') return;

    void handlePostRequest(msg.text, msg.platforms, msg.images)
      .then((results) => sendResponse({ results }))
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        sendResponse({ error: message });
      });

    return true;
  });
});

async function handleDiagnoseRequest(): Promise<DiagnosticsReport> {
  const tabs = await browser.tabs.query({});
  const platformResults: DiagnosePlatformResult[] = [];
  for (const tab of tabs) {
    if (typeof tab.url !== 'string' || typeof tab.id !== 'number') continue;
    const platform = (['x', 'bluesky', 'threads', 'mastodon', 'misskey', 'tumblr'] as const)
      .find((p) => getAdapter(p)?.matchUrl(tab.url ?? ''));
    if (!platform) continue;
    try {
      const res = (await browser.tabs.sendMessage(tab.id, {
        type: 'DIAGNOSE_PLATFORM',
        platform,
      })) as DiagnosePlatformResult | undefined;
      if (res?.type === 'DIAGNOSE_PLATFORM_RESULT') platformResults.push(res);
    } catch {
      // content script unreachable (no listener yet, or tab not ready)
      platformResults.push({
        type: 'DIAGNOSE_PLATFORM_RESULT',
        platform,
        url: tab.url,
        selectors: [],
        detectedUser: null,
      });
    }
  }
  // 診断 dump はユーザーが GitHub Issue 等に貼り付けて公開する想定なので、
  // SNS handle / 投稿本文プレビューなど PII になり得るフィールドは present/absent
  // のフラグに置き換える。handle そのものは popup の compose 行に表示しているので
  // 自分の確認には diagnostic dump は不要。
  const lastSeenRaw = await import('../src/storage').then((m) => m.getLastSeenUsers());
  const lastSeenRedacted: Record<string, string> = {};
  for (const [k, v] of Object.entries(lastSeenRaw)) {
    if (v) lastSeenRedacted[k] = '<present>';
  }
  const historyRaw = (await import('../src/storage').then((m) => m.getPostHistory())).slice(0, 5);
  const historyRedacted = historyRaw.map((h) => ({
    id: h.id,
    textPreview: `<redacted ${h.textPreview.length} chars>`,
    platforms: h.platforms,
    results: h.results,
    hasMedia: h.hasMedia,
    timestamp: h.timestamp,
  }));
  const platformsRedacted = platformResults.map((p) => ({
    ...p,
    detectedUser: p.detectedUser ? '<present>' : null,
  }));
  return {
    version: browser.runtime.getManifest().version,
    generatedAt: new Date().toISOString(),
    userAgent: navigator.userAgent,
    settings: await getSettings(),
    lastSeenUsers: lastSeenRedacted,
    recentHistory: historyRedacted,
    platforms: platformsRedacted,
  };
}

interface DiagnosticsReport {
  version: string;
  generatedAt: string;
  userAgent: string;
  settings: Awaited<ReturnType<typeof getSettings>>;
  /** PII 除去済。値は '<present>' のフラグのみ */
  lastSeenUsers: Record<string, string>;
  /** PII 除去済。textPreview は文字数フラグに置換 */
  recentHistory: Array<{
    id: string;
    textPreview: string;
    platforms: PlatformId[];
    results: Partial<Record<PlatformId, boolean>>;
    hasMedia: boolean;
    timestamp: number;
  }>;
  /** PII 除去済。detectedUser は '<present>' or null */
  platforms: DiagnosePlatformResult[];
}

async function handlePostRequest(
  text: string,
  platforms: PlatformId[],
  images?: ImageAttachment[],
): Promise<PostResultMessage[]> {
  const results = await Promise.all(
    platforms.map(async (platform) => {
      const result = await postToPlatform(platform, text, images);
      // 各プラットフォーム完了時に popup へストリーム配信(popup が開いていれば届く)
      void browser.runtime
        .sendMessage({ type: 'PLATFORM_PROGRESS', result })
        .catch(() => {
          /* popup が閉じている場合は送信失敗するが無視 */
        });
      return result;
    }),
  );

  notifyResults(results);
  void addToPostHistory(text, results, (images?.length ?? 0) > 0);
  return results;
}

async function postToPlatform(
  platform: PlatformId,
  text: string,
  images?: ImageAttachment[],
): Promise<PostResultMessage> {
  const adapter = await resolveAdapter(platform);
  if (!adapter) {
    return {
      type: 'POST_RESULT',
      platform,
      success: false,
      error: '未対応のプラットフォームです',
    };
  }

  // 動画の制約チェック
  const videoItem = images?.find((img) => img.type.startsWith('video/'));
  if (videoItem) {
    // kinds が未対応なら即エラー(動画の長さで shortVideo / longVideo を判別)
    const isLong = (videoItem.durationS ?? 0) > 60;
    const requiredKind = isLong ? 'longVideo' : 'shortVideo';
    if (!adapter.kinds.includes(requiredKind)) {
      return {
        type: 'POST_RESULT',
        platform,
        success: false,
        error: `${requiredKind === 'longVideo' ? '長尺動画' : '短動画'}に未対応`,
      };
    }
    const err = checkVideoConstraint(
      platform,
      videoItem.durationS ?? 0,
      base64ByteLength(videoItem.data),
    );
    if (err) {
      return { type: 'POST_RESULT', platform, success: false, error: err };
    }
  } else if (images && images.length > 0) {
    // 画像の制約チェック(動画がない場合のみ、画像と動画は排他)
    const err = checkImageConstraint(
      platform,
      images.map((img) => base64ByteLength(img.data)),
    );
    if (err) {
      return { type: 'POST_RESULT', platform, success: false, error: err };
    }
  }

  const chunks = splitText(text, adapter.charLimit);

  for (let i = 0; i < chunks.length; i++) {
    if (i > 0) await sleep(CHUNK_INTERVAL_MS);
    const chunkImages = i === 0 ? images : undefined;

    try {
      await postSingleChunk(adapter, chunks[i]!, chunkImages);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        type: 'POST_RESULT',
        platform,
        success: false,
        error: chunks.length > 1 ? `${i + 1}/${chunks.length} パート目で失敗: ${msg}` : msg,
      };
    }
  }

  return { type: 'POST_RESULT', platform, success: true };
}

/**
 * アダプタを解決する。Mastodon はユーザー設定のインスタンス URL で compose URL を上書き。
 */
async function resolveAdapter(platform: PlatformId): Promise<PlatformAdapter | undefined> {
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

async function postSingleChunk(
  adapter: PlatformAdapter,
  text: string,
  images?: ImageAttachment[],
): Promise<void> {
  const { autoPost } = await getSettings();
  // content script API は dryRun の概念で書かれているので boundary で変換。
  // autoPost: false → dryRun: true(検証だけ、Post クリックしない)
  const dryRun = !autoPost;
  // SNS タブは常にバックグラウンド(active: false)で開く。
  // popup は新タブが foreground に来ると閉じる Chrome 仕様なので、popup を
  // 残すために autoPost ON/OFF どちらも背面化する。プレビュー(dry-run)時に
  // SNS の compose を見たいユーザーはタブバーから手動で切替できる。
  const tab = await openOrFocusTab(
    adapter.getComposeUrl(text),
    adapter.matchUrl,
    false,
  );
  if (typeof tab.id !== 'number') {
    throw new Error('SNS タブを開けませんでした');
  }

  const message: PostToPlatformMessage = {
    type: 'POST_TO_PLATFORM',
    platform: adapter.id,
    text,
    images,
    dryRun,
  };
  const response = (await browser.tabs.sendMessage(
    tab.id,
    message,
  )) as PostResultMessage | undefined;

  if (!response) {
    throw new Error('SNS ページが応答しません(タブを再読み込みしてください)');
  }
  if (!response.success) throw new Error(response.error ?? '投稿に失敗しました');
}

async function openOrFocusTab(
  composeUrl: string,
  matchUrl: (url: string) => boolean,
  active: boolean,
): Promise<Browser.tabs.Tab> {
  const existing = (await browser.tabs.query({})).find(
    (t) => typeof t.url === 'string' && matchUrl(t.url),
  );

  if (existing && typeof existing.id === 'number') {
    const updated = await browser.tabs.update(existing.id, {
      url: composeUrl,
      active,
    });
    if (!updated) {
      throw new Error('既存の SNS タブを操作できませんでした');
    }
    // active=true 指定の時のみ window もフォーカス。 false の時はユーザーの作業を邪魔しない
    if (active && typeof existing.windowId === 'number') {
      await browser.windows.update(existing.windowId, { focused: true });
    }
    await waitForTabComplete(existing.id);
    await sleep(READY_DELAY_MS);
    return updated;
  }

  const created = await browser.tabs.create({ url: composeUrl, active });
  if (typeof created.id !== 'number') {
    throw new Error('SNS タブを開けませんでした');
  }
  await waitForTabComplete(created.id);
  await sleep(READY_DELAY_MS);
  return created;
}

function waitForTabComplete(tabId: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      browser.tabs.onUpdated.removeListener(listener);
      reject(new Error('SNS ページの読み込みがタイムアウトしました(回線か SNS の状態を確認)'));
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
      log.info(`✓ ${r.platform}`);
    } else {
      log.error(`✗ ${r.platform}: ${r.error ?? '(no detail)'}`);
    }
  }
}
