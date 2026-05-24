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
  adapters,
  checkImageConstraint,
  getAdapter,
} from '../src/adapters/registry';
import { getEffectiveVideoConstraints } from '../src/utils/effective-limits';
import type { PlatformAdapter } from '../src/adapters/types';
import { addToPostHistory, getSettings, setLastSeenUser } from '../src/storage';
import { base64ByteLength } from '../src/utils/base64';
import { putBinary, deleteBinary, getBinary } from '../src/utils/binary-transfer';
import {
  attachmentSize,
  releaseAttachmentTransfers,
  resolveAttachmentToBase64,
  resolveAttachmentToBytes,
} from '../src/utils/attachment';
import { computeBodyHash, sha256Hex } from '../src/utils/body-hash';
import { extractPostId } from '../src/utils/post-id';
import { putMedia, sweepExpired } from '../src/utils/history-media';
import { fetchOverridesFrom } from '../src/utils/selector-overrides';
import { splitText } from '../src/utils/split';
import { letterboxToSquare } from '../src/utils/image-letterbox';
import { getApiCredentials } from '../src/utils/api-credentials';
import { postViaApi as postBlueskyApi, postViaSession as postBlueskyViaSession, type BlueskyReplyTarget } from '../src/api/bluesky';
import { isVerifySupported } from '../src/utils/post-verify';
import { runVerify } from '../src/background/verify-dispatcher';
import { openOrFocusTab, notifyResults, clearBadge, updateProgressBadge, closeTabSafely } from '../src/background/tab-management';
import { postViaApi as postMastodonApi } from '../src/api/mastodon';
import { postViaApi as postMisskeyApi } from '../src/api/misskey';
import type { ApiPostResult } from '../src/api/types';

const CHUNK_INTERVAL_MS = 2000;

/**
 * BROADCAST_REFRESH_USERS の throttle interval (v0.4.85〜)。
 * popup を高速で何度も開閉したときに 全 SNS tab で detection が
 * 連発するのを防ぐ。 account は数秒単位では変わらないので 5s で十分。
 */
const BROADCAST_REFRESH_THROTTLE_MS = 5000;
let lastBroadcastRefreshAt = 0;

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

// P19: popup 閉じ→再開時に進捗 UI を復活させるための memo。
// service worker が sleep するとリセットされるが、active な圧縮中は in-flight
// promise が SW を起こし続けるので問題なし。
let compressionStateInMemory: { progress: number; stage: 'load' | 'transcode' } | null = null;
let postingInMemory: boolean = false;

/**
 * v0.4.63: 投稿中の richer な state を background 側で保持する。popup を閉じて
 * 再 open しても「2/7 完了」「残り 5 が pending」が正しく復元できるようにする。
 * 旧コードは postingInMemory: boolean だけで、popup が閉じた瞬間に進捗が消えて
 * 開き直すと「全部 Queue...」と表示されるバグの原因になっていた。
 *
 * v0.4.96: 投稿完了後も state を保持する (旧 path は finally で null 化していた
 * が、 wizard SNS が foreground tab を開いて popup が閉じてしまうケースで、
 * user が popup 再 open したときに「何も無い」 state で表示されていた事故が
 * あった (user 報告 2026-05-23)。 done=true で「最終結果」 を持ち続け、
 * 次の POST_REQUEST 起動時に overwrite される。
 */
interface PostingState {
  platforms: PlatformId[];
  pending: Set<PlatformId>;
  results: PostResultMessage[];
  startedAt: number;
  /** 全 worker が完了したか。 true なら results は最終状態、 popup は結果 panel に切替 */
  done: boolean;
  finishedAt?: number;
}
let postingStateInMemory: PostingState | null = null;

/**
 * v0.5.0: displayMode に応じて action click 動作を切替える。
 * - 'popup': default_popup が処理 (manifest 側で popup.html 指定)。
 *   setPanelBehavior false で onClicked 経路はバイパス、 default_popup が
 *   そのまま発火する。
 * - 'sidepanel': setPanelBehavior true で Chrome が click を直接 side panel
 *   open に振る。 default_popup より優先。
 * - 'floating': setPanelBehavior false。 default_popup が無効化されるよう
 *   action.setPopup({popup: ''}) で popup HTML を空にする → onClicked が発火
 *   → openFloatingTutti を呼ぶ。
 *
 * v0.5.6: 'auto' を追加 (default)。 sidepanel → floating → popup の順に capability
 * 検出してフォールスルー。 Chrome 114+ は sidepanel に着地、 旧 Chrome や
 * sidePanel 無効化環境では floating、 さらにダメなら popup。
 */
async function applyDisplayModeBehavior(): Promise<void> {
  try {
    const { displayMode } = await getSettings();
    const effective = displayMode === 'auto' ? resolveAutoDisplayMode() : displayMode;

    if (effective === 'sidepanel') {
      // sidepanel mode: 「アイコン click で side panel open」 を Chrome ネイティブで
      if (browser.sidePanel?.setPanelBehavior) {
        await browser.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
      }
      // popup は無効化 (= sidepanel に流す)
      await browser.action.setPopup({ popup: '' });
    } else if (effective === 'floating') {
      if (browser.sidePanel?.setPanelBehavior) {
        await browser.sidePanel.setPanelBehavior({ openPanelOnActionClick: false });
      }
      // popup を空にして onClicked が発火するように
      await browser.action.setPopup({ popup: '' });
    } else {
      // popup (default)
      if (browser.sidePanel?.setPanelBehavior) {
        await browser.sidePanel.setPanelBehavior({ openPanelOnActionClick: false });
      }
      await browser.action.setPopup({ popup: 'popup.html' });
    }
    log.info(`displayMode applied: ${displayMode}${displayMode === 'auto' ? ` (resolved: ${effective})` : ''}`);
  } catch (e) {
    log.warn(`applyDisplayModeBehavior failed: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/**
 * 'auto' を解決: sidepanel → floating → popup の順で利用可能なものに着地。
 *
 * - sidepanel: `chrome.sidePanel.setPanelBehavior` が関数として存在するか
 *   (Chrome 114+ で導入。 Firefox は未対応)
 * - floating: `chrome.windows.create` が利用可能か (MV3 で常にある想定だが
 *   一応 detect。 ChromeBook/Android tablet 等で window 無いケースに備える)
 * - popup: 最終フォールバック (default_popup は manifest にあるので常に動く)
 */
function resolveAutoDisplayMode(): 'sidepanel' | 'floating' | 'popup' {
  if (typeof browser.sidePanel?.setPanelBehavior === 'function') return 'sidepanel';
  if (typeof browser.windows?.create === 'function') return 'floating';
  return 'popup';
}

/**
 * floating window として Tutti を開く。 1 個既に開いてれば focus するだけ、
 * 無ければ新規 create。 位置 / サイズは前回値を chrome.storage に persist。
 */
const FLOATING_WIN_KEY = 'tuttiFloatingWindow';
async function openFloatingTutti(): Promise<void> {
  const url = browser.runtime.getURL('/popup.html?floating=1');
  const stored = await browser.storage.local.get(FLOATING_WIN_KEY);
  const saved = stored[FLOATING_WIN_KEY] as { id?: number; left?: number; top?: number; width?: number; height?: number } | undefined;
  // 既存 floating window を再 focus
  if (saved?.id) {
    try {
      const w = await browser.windows.get(saved.id);
      if (w) {
        await browser.windows.update(saved.id, { focused: true });
        return;
      }
    } catch { /* window 消えてる、 再 create に進む */ }
  }
  const width = saved?.width ?? 440;
  const height = saved?.height ?? 720;
  const created = await browser.windows.create({
    url,
    type: 'popup',
    width,
    height,
    left: saved?.left ?? undefined,
    top: saved?.top ?? undefined,
    focused: true,
  });
  if (created?.id !== undefined) {
    await browser.storage.local.set({
      [FLOATING_WIN_KEY]: {
        id: created.id,
        left: created.left,
        top: created.top,
        width: created.width,
        height: created.height,
      },
    });
  }
}

// floating window が closed されたら id を消す + position 保存
browser.windows?.onRemoved?.addListener(async (windowId) => {
  const stored = await browser.storage.local.get(FLOATING_WIN_KEY);
  const saved = stored[FLOATING_WIN_KEY] as { id?: number } | undefined;
  if (saved?.id === windowId) {
    await browser.storage.local.set({ [FLOATING_WIN_KEY]: { ...saved, id: undefined } });
  }
});

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

  // v0.5.5: 履歴メディア (IndexedDB) の 7 日 retention sweep。 起動時に古い
  // record を一掃して storage を圧迫しないようにする。 失敗しても拡張機能本体
  // には影響しないので catch して swallow。
  void sweepExpired().catch((e) => log.warn('history media sweep failed', e));

  // v0.5.0: displayMode に応じて action click 動作を切替。
  // - popup: manifest の default_popup が処理 (= 何もしない)
  // - sidepanel: setPanelBehavior でアイコン click → side panel open
  // - floating: action.onClicked で popup window を spawn
  void applyDisplayModeBehavior();
  // settings 変更時に再適用
  browser.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && changes.settings) {
      void applyDisplayModeBehavior();
    }
  });

  // floating mode のアイコン click handler。
  // sidepanel/popup mode のときは setPanelBehavior + default_popup が処理するので
  // この listener は call されない (= floating mode 限定)。
  browser.action.onClicked.addListener(async () => {
    try {
      const { displayMode } = await getSettings();
      const effective = displayMode === 'auto' ? resolveAutoDisplayMode() : displayMode;
      if (effective === 'floating') {
        await openFloatingTutti();
      } else if (effective === 'popup') {
        // setPanelBehavior=false + default_popup=空 のはずだが、 念のため fallback
        try { await browser.action.openPopup(); } catch { /* user gesture が足りなければ skip */ }
      }
      // sidepanel mode の場合は setPanelBehavior が click を吸って onClicked は発火しない
    } catch (e) {
      log.warn(`action click handler failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  });

  browser.runtime.onMessage.addListener((rawMsg, _sender, sendResponse) => {
    const msg = rawMsg as Message;

    if (msg.type === 'CURRENT_USER') {
      void setLastSeenUser(msg.platform, msg.username);
      return; // fire-and-forget
    }

    if (msg.type === 'BROADCAST_REFRESH_USERS') {
      // v0.4.83: popup mount 時に全 SNS tab に REFRESH_USER を送って
      // active user を再検出させる。 multi-account 切替後の stale を防ぐ。
      // v0.4.85: 5 秒 throttle。 popup を高速で何度も開閉した場合に
      // 無駄な detection 連発を防ぐ。 5s 以内なら lastSeenUsers の cache を
      // そのまま使う方が安全 (account は数秒単位で変わらない)。
      const now = Date.now();
      if (now - lastBroadcastRefreshAt < BROADCAST_REFRESH_THROTTLE_MS) {
        log.debug(`BROADCAST_REFRESH_USERS throttled (last ${Math.round((now - lastBroadcastRefreshAt) / 1000)}s ago)`);
        return;
      }
      lastBroadcastRefreshAt = now;
      void (async () => {
        const tabs = await browser.tabs.query({});
        const adapterList = Object.values(adapters).filter(
          (a): a is PlatformAdapter => a !== undefined,
        );
        for (const t of tabs) {
          if (typeof t.id !== 'number' || !t.url) continue;
          // 各 adapter の matchUrl にマッチする tab に絞る
          const matched = adapterList.find((a) => a.matchUrl(t.url!));
          if (!matched) continue;
          // sendMessage は async + fire-and-forget。 content script が居なければ
          // throw するので catch して握り潰す。
          browser.tabs.sendMessage(t.id, { type: 'REFRESH_USER' }).catch(() => { /* ignore */ });
        }
      })();
      return; // fire-and-forget、 結果は CURRENT_USER 経由で storage に
    }

    // P19: 進捗 UI を popup 閉じ→再開でも復活させるため、background で進捗状態を覚える
    if (msg.type === 'CONVERSION_PROGRESS') {
      compressionStateInMemory = { progress: msg.progress, stage: msg.stage ?? 'transcode' };
      return; // popup 側でも listen してるので fire-and-forget
    }
    if (msg.type === 'CONVERSION_COMPLETE' || msg.type === 'CONVERSION_ERROR') {
      compressionStateInMemory = null;
      return; // 同上
    }
    if (msg.type === 'CLEAR_POSTING_STATE') {
      // popup から明示的に「結果を消す / 新規投稿に備える」 ためのクリア。
      // v0.4.96: postingStateInMemory を完了後も保持するようにした (popup の
      // 再 open で 「結果が消える」 事故防止) ことに対するペアの API。
      postingStateInMemory = null;
      clearBadge();
      sendResponse({ ok: true });
      return false;
    }

    if (msg.type === 'GET_BG_STATE') {
      // v0.4.96: popup が開かれた = user が結果を見た → badge を clear する。
      // postingState 自体は保持 (popup を閉じて再 open でも結果が見えるように)。
      // v0.4.100: 投稿中 (postingInMemory=true) は clear しない (進捗が見えなくなる
      // bug の原因)。 完了済 state を user が popup で確認したタイミング =
      // postingInMemory=false かつ postingStateInMemory.done=true の場合のみ clear。
      if (!postingInMemory && postingStateInMemory?.done) {
        clearBadge();
      }
      sendResponse({
        compression: compressionStateInMemory,
        posting: postingInMemory,
        // v0.4.63: 投稿中の platform 別の進捗を popup に返す。pending / results を
        // popup 側で再現してリッチな UI を復元する。 v0.4.96: done フラグも
        // 含めて popup が 「投稿中」 / 「完了済結果」 を区別できるように。
        postingState: postingStateInMemory
          ? {
              platforms: postingStateInMemory.platforms,
              pending: Array.from(postingStateInMemory.pending),
              results: postingStateInMemory.results.slice(),
              done: postingStateInMemory.done,
              finishedAt: postingStateInMemory.finishedAt,
            }
          : null,
      });
      return true;
    }

    // P19: content script からの chunked binary 取得 (tabs.sendMessage 64MB cap 回避)
    if (msg.type === 'GET_BINARY_CHUNK') {
      void (async () => {
        try {
          const bytes = await getBinary(msg.dataRef);
          if (bytes.length === 0) {
            // 0-byte が IDB に書き込まれてた = どこかで silent failure。
            // content script の materialize で「missing data」assert に
            // つながる前にここで explicit error を返して原因切り分け可能にする。
            log.warn(`GET_BINARY_CHUNK: dataRef=${msg.dataRef} は 0-byte (書き込み失敗の疑い)`);
            sendResponse({ error: `IDB に 0-byte の binary (dataRef=${msg.dataRef})` });
            return;
          }
          const start = Math.max(0, msg.offset);
          const end = Math.min(start + msg.length, bytes.length);
          const slice = bytes.subarray(start, end);
          // SAB 由来の場合があるので clean ArrayBuffer に copy
          const buf = new ArrayBuffer(slice.byteLength);
          new Uint8Array(buf).set(slice);
          const { arrayBufferToBase64 } = await import('../src/utils/base64');
          sendResponse({ chunk: arrayBufferToBase64(buf), totalSize: bytes.length, end });
        } catch (e) {
          const errMsg = e instanceof Error ? e.message : String(e);
          log.error(`GET_BINARY_CHUNK 失敗: dataRef=${msg.dataRef} — ${errMsg}`);
          sendResponse({ error: errMsg });
        }
      })();
      return true;
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

    void handlePostRequest(msg.text, msg.platforms, msg.images, msg.cw, msg.visibility, msg.trimVideoToSeconds)
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
  // 全 11 adapter を回す
  const platformIds = Object.keys(adapters) as PlatformId[];

  function tabHost(tabUrl: string): string {
    try { return new URL(tabUrl).host; } catch { return ''; }
  }

  for (const tab of tabs) {
    if (typeof tab.url !== 'string' || typeof tab.id !== 'number') continue;
    const platform = platformIds.find((p) => getAdapter(p)?.matchUrl(tab.url ?? ''));
    if (!platform) continue;
    try {
      const res = (await browser.tabs.sendMessage(tab.id, {
        type: 'DIAGNOSE_PLATFORM',
        platform,
      })) as DiagnosePlatformResult | undefined;
      if (res?.type !== 'DIAGNOSE_PLATFORM_RESULT') continue;
      // **privacy critical**: compose 系 tab だけ result に含める。
      // 全 selector が miss + detectedUser も無い tab は閲覧 / 視聴ページ等
      // (例: youtube.com/watch?v=xxx)、ユーザの不関係 browsing を public Issue
      // に流してしまう事故 (v0.4.32 で発生) を防ぐ。
      const hasHit = res.selectors.some((s) => s.matchCount > 0);
      const hasUser = !!res.detectedUser;
      if (!hasHit && !hasUser) continue;
      platformResults.push(res);
    } catch {
      // content script unreachable (= まだ inject されてない or wrong page)。
      // これも compose context じゃないので skip (privacy 寄りの判断)。
      // 旧コードは tab.url を full URL で payload に入れていて leak の原因だった
      void tabHost;
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
    // v0.4.88: results に url / error が入るようになったので diagnostics 経路では redact
    // url / error は PII を含み得る (post id / handle) ので public Issue に流さない
    results: Object.fromEntries(
      Object.entries(h.results).map(([k, v]) => [k, { success: v?.success ?? false }]),
    ) as Partial<Record<PlatformId, { success: boolean; url?: string; error?: string }>>,
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
    results: Partial<Record<PlatformId, { success: boolean; url?: string; error?: string }>>;
    hasMedia: boolean;
    timestamp: number;
  }>;
  /** PII 除去済。detectedUser は '<present>' or null */
  platforms: DiagnosePlatformResult[];
}

/**
 * v0.4.63: 投稿の並列度上限。旧コードは `Promise.all` で全 SNS を完全並列に
 * 投げていた (11 SNS 選択時は 11 tab 同時 open) ため Chrome のリソース上限を
 * 突き、各 SNS の content script 初期化 / file upload / network が互いに
 * 干渉して「全 SNS 成功することがまずない」状態だった。並列度 3 に絞ると
 * 各 SNS が落ち着いて処理される。所要時間は 11 SNS × 各 10s ≒ 40s と
 * 実用的な範囲に収まる。
 */
const POST_CONCURRENCY = 3;

async function handlePostRequest(
  text: string,
  platforms: PlatformId[],
  images?: ImageAttachment[],
  cw?: string,
  visibility?: 'public' | 'unlisted' | 'private' | 'direct',
  trimVideoToSeconds?: number,
): Promise<PostResultMessage[]> {
  postingInMemory = true;
  // v0.4.97: 新規 post 開始 = 前回 state を完全上書き
  postingStateInMemory = {
    platforms: [...platforms],
    pending: new Set(platforms),
    results: [],
    startedAt: Date.now(),
    done: false,
  };
  // 開始時に「0/N」 progress badge を表示 (青)
  updateProgressBadge(0, platforms.length);
  try {
  // P16: 動画があり、いずれかの選択中 SNS の maxBytes を超える場合は事前に圧縮
  const adjustedImages = await maybeCompressVideoForBudget(platforms, images, trimVideoToSeconds);

  // 並列度制限 (POST_CONCURRENCY 同時) の worker pool。
  // 各 worker は queue から platform を取り出して処理 → 結果を state と
  // PLATFORM_PROGRESS broadcast に流し込む → 次の platform を取りに行く。
  const queue: PlatformId[] = [...platforms];
  const results: PostResultMessage[] = [];
  const workers: Promise<void>[] = [];
  const workerCount = Math.min(POST_CONCURRENCY, queue.length);
  for (let i = 0; i < workerCount; i++) {
    workers.push((async () => {
      while (queue.length > 0) {
        const platform = queue.shift();
        if (!platform) break;
        const result = await postToPlatform(platform, text, adjustedImages, cw, visibility);
        results.push(result);
        // background 側の state を更新 (popup 再 open 時に GET_BG_STATE で復元される)
        if (postingStateInMemory) {
          postingStateInMemory.pending.delete(platform);
          postingStateInMemory.results.push(result);
          // v0.4.97: 1 platform 完了の度に progress badge 更新 (N/M 表示)
          updateProgressBadge(postingStateInMemory.results.length, postingStateInMemory.platforms.length);
        }
        // popup へストリーム配信(popup が開いていれば届く、閉じてれば↑の state で復元)
        void browser.runtime
          .sendMessage({ type: 'PLATFORM_PROGRESS', result })
          .catch(() => { /* popup 閉じてれば失敗、無視 */ });
      }
    })());
  }
  await Promise.all(workers);

  notifyResults(results);
  // v0.5.5: schema v1 用の metadata 計算 → addToPostHistory に渡す
  void recordHistoryEntry(text, results, adjustedImages);
  // v0.5.7: 成功 SNS の compose / share タブを cleanup (Tutti が新規 open したものに限る)
  void cleanupOpenedTabs(results);
  // IndexedDB binary-transfer の cleanup (元 dataRef + 圧縮結果 dataRef 両方)
  void releaseAttachmentTransfers(adjustedImages);
  if (adjustedImages !== images) void releaseAttachmentTransfers(images);
  return results;
  } finally {
    postingInMemory = false;
    // v0.4.96: postingStateInMemory は null 化せず、 done=true + finishedAt で
    // 「完了済結果」 として保持。 popup 再 open 時に GET_BG_STATE で結果が
    // 戻る。 次の POST_REQUEST 起動時に上書き、 もしくは popup から
    // CLEAR_POSTING_STATE で明示クリア。
    if (postingStateInMemory) {
      postingStateInMemory.done = true;
      postingStateInMemory.finishedAt = Date.now();
    }
    compressionStateInMemory = null;
  }
}

/**
 * v0.5.7: handlePostRequest 内で開かれた compose / share タブを追跡。
 * platform → 新規 open した tab ID の Set。 post 成功後に cleanup する判定で使う。
 * 1 つの POST_REQUEST 内では同じ platform に複数 tab が紐づくことは無いが (= 1 tab/post)、
 * future-proof のため Set 構造で持つ。
 */
const openedTabsByPlatform: Map<PlatformId, Set<number>> = new Map();

function recordOpenedTab(platform: PlatformId, tabId: number): void {
  let set = openedTabsByPlatform.get(platform);
  if (!set) {
    set = new Set();
    openedTabsByPlatform.set(platform, set);
  }
  set.add(tabId);
}

/**
 * v0.5.7: post 成功 SNS の Tutti 起源 tab を閉じる。 例 Mastodon の /share タブが
 * 投稿完了後も残って 「印象悪い」 問題の対処。 失敗 SNS の tab は user が
 * 調査できるように残す。
 *
 * - success=true かつ Tutti が新規 open した tab を close
 * - tab record は閉じても残らず使い切り
 * - autoOpenPostUrl='always' で別 tab が開かれるので post URL は失われない
 */
async function cleanupOpenedTabs(results: PostResultMessage[]): Promise<void> {
  try {
    for (const r of results) {
      if (!r.success) continue;
      const set = openedTabsByPlatform.get(r.platform);
      if (!set) continue;
      for (const tabId of set) {
        await closeTabSafely(tabId);
      }
      openedTabsByPlatform.delete(r.platform);
    }
    // 失敗 SNS の tab record も clean (次回の POST_REQUEST に持ち越さない)
    for (const r of results) {
      if (!r.success) openedTabsByPlatform.delete(r.platform);
    }
  } catch (e) {
    log.warn(`cleanupOpenedTabs failed: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/**
 * v0.5.5: 履歴 entry を schema v1 で保存。
 * - 本文 + 各メディア digest から bodyHash 計算
 * - 各 SNS 結果 URL から postId 抽出
 * - Settings.historyKeepMedia=ON なら IndexedDB に media を保存 (7 日間 retention)
 *
 * すべて 「投稿は終わっている」 段階の post-hoc 処理。 失敗しても投稿には
 * 影響しないので catch して swallow する (履歴は best-effort 機能)。
 */
async function recordHistoryEntry(
  text: string,
  results: PostResultMessage[],
  adjustedImages?: ImageAttachment[],
): Promise<void> {
  try {
    const hasMedia = (adjustedImages?.length ?? 0) > 0;

    // 各メディアの SHA-256 digest を並列で計算
    const mediaDigests: string[] = [];
    if (adjustedImages && adjustedImages.length > 0) {
      const bytesList = await Promise.all(
        adjustedImages.map((img) => resolveAttachmentToBytes(img).catch(() => null)),
      );
      for (const bytes of bytesList) {
        if (bytes) mediaDigests.push(await sha256Hex(bytes));
      }
    }

    const bodyHash = await computeBodyHash(text, mediaDigests);

    // 各 SNS の post URL から固有 postId を抽出
    const postIds: Partial<Record<PlatformId, string>> = {};
    for (const r of results) {
      const pid = extractPostId(r.platform, r.url);
      if (pid) postIds[r.platform] = pid;
    }

    // Settings.historyKeepMedia=ON 時のみ、 媒体実体を IndexedDB に保存。
    // 保存 ID は `${entryId}-${index}` 形式 (entryId は addToPostHistory が決める)。
    // ここでは「保存するつもりの index 列」 を準備して、 entryId が確定したら参照を作る。
    const settings = await getSettings().catch(() => null);
    const keepMedia = settings?.historyKeepMedia === true;

    // entry を先に作って ID を得る → そこから media key 列を構築
    const entryId = await addToPostHistory(text, results, hasMedia, {
      bodyHash,
      postIds,
      mediaRefs: keepMedia && adjustedImages && adjustedImages.length > 0
        ? adjustedImages.map((_, i) => `pending-${i}`) // 後で書き換える placeholder
        : undefined,
    });

    if (keepMedia && adjustedImages && adjustedImages.length > 0) {
      const mediaIds: string[] = [];
      for (let i = 0; i < adjustedImages.length; i += 1) {
        const img = adjustedImages[i];
        if (!img) continue;
        try {
          const bytes = await resolveAttachmentToBytes(img);
          // Uint8Array → BlobPart: TS の SharedArrayBuffer 型差異を避けて buffer をコピー
          const blob = new Blob([bytes.slice().buffer as ArrayBuffer], {
            type: img.type || 'application/octet-stream',
          });
          const id = `${entryId}-${i}`;
          await putMedia(id, blob);
          mediaIds.push(id);
        } catch {
          // 個別 attach の保存失敗は無視 (history 自体は既に保存済)
        }
      }
      // 実際に保存できた id 列で entry を update (placeholder からの差し替え)
      if (mediaIds.length > 0) {
        await updateHistoryMediaRefs(entryId, mediaIds);
      }
    }
  } catch {
    // 履歴記録は best-effort。 失敗しても表に出さない (= 投稿は既に成功)
  }
}

/** v0.5.5: 履歴 entry の mediaRefs だけを後から書き換える (IndexedDB 保存完了後)。 */
async function updateHistoryMediaRefs(entryId: string, mediaIds: string[]): Promise<void> {
  const stored = await browser.storage.local.get('postHistory');
  const arr = (stored['postHistory'] as Array<{ id: string; mediaRefs?: string[] }> | undefined) ?? [];
  const updated = arr.map((e) => (e.id === entryId ? { ...e, mediaRefs: mediaIds } : e));
  await browser.storage.local.set({ postHistory: updated });
}

/**
 * 選択中 SNS の最小 maxBytes を求めて、動画サイズが超えてれば offscreen に
 * 委譲して再エンコード。圧縮失敗時は元動画を返して既存 constraint check で
 * エラー報告する従来挙動に倒す (= 「最低でも今までと同等」を保証)。
 *
 * 画像のみ / 動画なしの場合は何もせず images をそのまま返す。
 */
/**
 * 画像を per-platform で resize する (v0.4.81〜)。
 * popup で max-of-selected を ceiling として既に縮小済の画像群を、 各 SNS の
 * maxBytesPerImage に合わせて改めて縮小する。 既に範囲内ならそのまま (no-op)。
 *
 * 旧 logic は popup で全 SNS の min(maxBytesPerImage) に強制縮小していたので、
 * Bluesky 1MB に他 SNS (X 5MB / Threads 8MB / IG 30MB) も引きずられて低解像度
 * になっていた。 各 SNS 別の resize にすることで Bluesky 以外は高解像度 を維持。
 *
 * 画像のみ (動画は size 制約は handlePostRequest 側で一括圧縮、 ここは触らない)。
 */
async function maybeResizeImagesForPlatform(
  adapter: PlatformAdapter,
  images: ImageAttachment[],
): Promise<ImageAttachment[]> {
  const maxBytes = adapter.imageConstraints.maxBytesPerImage;
  if (!maxBytes) return images;

  const { resizeImageInSW } = await import('../src/utils/image-resize');
  const out: ImageAttachment[] = [];
  for (const img of images) {
    if (!img.type.startsWith('image/')) {
      out.push(img);
      continue;
    }
    // dataRef ベースの大きい画像は IDB から取り出して base64 化
    let data = img.data;
    if (!data && img.dataRef) {
      const resolved = await resolveAttachmentToBase64(img);
      data = resolved.data;
    }
    if (!data) {
      out.push(img); // resolve できなければ original そのまま
      continue;
    }
    try {
      const resized = await resizeImageInSW(data, img.type, maxBytes);
      if (resized === data) {
        out.push(img);
      } else {
        out.push({
          name: img.name.replace(/\.[^.]+$/, '.jpg'),
          type: 'image/jpeg',
          data: resized,
        });
      }
    } catch (e) {
      log.warn(`${adapter.id}: per-platform resize 失敗、 original で送信: ${e instanceof Error ? e.message : String(e)}`);
      out.push(img);
    }
  }
  return out;
}

async function maybeCompressVideoForBudget(
  platforms: PlatformId[],
  images?: ImageAttachment[],
  trimToSeconds?: number,
): Promise<ImageAttachment[] | undefined> {
  if (!images || images.length === 0) return images;
  const videoIdx = images.findIndex((m) => m.type.startsWith('video/'));
  if (videoIdx < 0) return images;
  const video = images[videoIdx]!;
  const currentBytes = attachmentSize(video);

  // 選択中 SNS の中で「動画を受け付ける + maxBytes が定義されてる」やつだけ集計。
  // P17: probe + override 込みの有効値で集計 (= bsky 100MB 緩和等が反映される)
  let minBytes = Infinity;
  for (const p of platforms) {
    const a = getAdapter(p);
    if (!a?.videoConstraints) continue;
    const eff = await getEffectiveVideoConstraints(p, a.videoConstraints);
    if (!eff.maxBytes) continue;
    if (eff.maxBytes < minBytes) minBytes = eff.maxBytes;
  }

  // v0.4.81: Settings.autoLetterboxVerticalVideo が ON で、 選択中に縦動画 SNS
  // (TikTok / YouTube Shorts / IG Reels) が含まれる場合は **size が範囲内でも
  // 9:16 letterbox のため再エンコードする**。 横長 / 正方形動画は 1080×1920 に
  // ぼかし背景 letterbox、 縦長は scale だけで影響なし。
  const { autoLetterboxVerticalVideo } = await getSettings();
  const VERTICAL_SNS: PlatformId[] = ['tiktok', 'youtube', 'instagram'];
  const needsVerticalLetterbox =
    autoLetterboxVerticalVideo && platforms.some((p) => VERTICAL_SNS.includes(p));

  // v0.4.90: trim opt-in
  const needsTrim = !!(trimToSeconds && trimToSeconds > 0 && (video.durationS ?? 0) > trimToSeconds);

  if (minBytes === Infinity && !needsVerticalLetterbox && !needsTrim) return images;
  if (currentBytes <= minBytes && !needsVerticalLetterbox && !needsTrim) return images;

  // target を決定: size 圧縮が要らない場合は元 size 維持 (letterbox / trim のみ)
  const targetBytes = minBytes === Infinity ? currentBytes : Math.min(currentBytes, minBytes);
  const aspectMode: 'passthrough' | 'vertical9x16' = needsVerticalLetterbox ? 'vertical9x16' : 'passthrough';
  log.info(`P16/P81: video ${(currentBytes / 1024 / 1024).toFixed(1)}MB → 目標 ${(targetBytes / 1024 / 1024).toFixed(1)}MB${needsVerticalLetterbox ? ' + 9:16 letterbox' : ''}${needsTrim ? ` + trim to ${trimToSeconds}s` : ''}`);

  // offscreen には dataRef だけ渡す (sendMessage 64MB cap 回避)。
  // dataRef が無ければ data を IndexedDB に書いて id を作る
  let inputRef = video.dataRef;
  let inputRefOwned = false;
  if (!inputRef) {
    if (!video.data) {
      throw new Error('動画 attachment に data も dataRef もありません (popup pack 漏れ?)');
    }
    const { base64ToUint8Array } = await import('../src/utils/base64');
    inputRef = await putBinary(base64ToUint8Array(video.data));
    inputRefOwned = true;
  }

  try {
    const compressed = await runOffscreenCompress({
      inputRef,
      mimeType: video.type,
      durationS: video.durationS ?? 0,
      targetBytes,
      aspectMode,
      trimToSeconds: needsTrim ? trimToSeconds : undefined,
    });
    log.info(`P16: 圧縮完了 ${(compressed.outputBytes / 1024 / 1024).toFixed(1)}MB`);
    const newImages = images.slice();
    newImages[videoIdx] = {
      name: video.name,
      type: 'video/mp4',
      durationS: video.durationS,
      dataRef: compressed.outputRef,
      bytes: compressed.outputBytes,
    };
    return newImages;
  } catch (err) {
    // 旧コードはここで silent fallthrough して元動画で投稿試行 → constraint check で
    // 「151MB > 50MB」のような誤解しやすい error が出ていた。
    // 圧縮失敗は explicit に user に見せる
    const detail = err instanceof Error ? err.message : String(err);
    log.error(`P16: 圧縮失敗 — ${detail}`);
    throw new Error(`動画の自動圧縮に失敗: ${detail}`);
  } finally {
    if (inputRefOwned && inputRef) await deleteBinary(inputRef).catch(() => {});
  }
}

// chrome.offscreen は webextension-polyfill (= browser) 経由でブリッジされない
// MV3 Chrome 専用 API。global chrome を直接使う。型は緩めに自分で書く。
interface OffscreenApi {
  createDocument(opts: { url: string; reasons: string[]; justification: string }): Promise<void>;
  hasDocument?: () => Promise<boolean>;
}
const offscreenApi: OffscreenApi | undefined = (
  globalThis as unknown as { chrome?: { offscreen?: OffscreenApi } }
).chrome?.offscreen;

let offscreenReady: Promise<void> | null = null;
async function ensureOffscreen(): Promise<void> {
  if (offscreenReady) return offscreenReady;
  if (!offscreenApi) throw new Error('chrome.offscreen API が利用できません');
  offscreenReady = (async () => {
    const exists = offscreenApi.hasDocument ? await offscreenApi.hasDocument() : false;
    if (exists) return;
    await offscreenApi.createDocument({
      url: 'offscreen.html',
      reasons: ['WORKERS'],
      justification: 'ffmpeg.wasm video transcoding for size compression',
    });
  })();
  try {
    await offscreenReady;
  } catch (e) {
    offscreenReady = null;
    throw e;
  }
}

async function runOffscreenCompress(req: {
  inputRef: string;
  mimeType: string;
  durationS: number;
  targetBytes: number;
  aspectMode?: 'passthrough' | 'vertical9x16';
  trimToSeconds?: number;
}): Promise<{ outputRef: string; outputBytes: number }> {
  await ensureOffscreen();
  try {
    const res = (await browser.runtime.sendMessage({
      type: 'CONVERT_VIDEO',
      inputRef: req.inputRef,
      mimeType: req.mimeType,
      durationS: req.durationS,
      targetBytes: req.targetBytes,
      aspectMode: req.aspectMode,
      trimToSeconds: req.trimToSeconds,
    })) as { type: string; outputRef?: string; outputBytes?: number; error?: string } | undefined;
    if (!res || res.type === 'CONVERSION_ERROR' || !res.outputRef) {
      throw new Error(res?.error ?? '変換が応答しません');
    }
    return { outputRef: res.outputRef, outputBytes: res.outputBytes ?? 0 };
  } finally {
    // 圧縮終了 (成功 / 失敗) を popup に通知して進捗 UI を引っ込める。
    // 旧コードは offscreen の CONVERSION_COMPLETE が sendResponse 経由で
    // popup に届かず、進捗バーが「100%」のまま固まってた (popup は
    // PLATFORM_PROGRESS 到来までは消さない)。
    compressionStateInMemory = null;
    void browser.runtime.sendMessage({ type: 'CONVERSION_COMPLETE' }).catch(() => { /* popup 閉じてれば失敗、無視 */ });
  }
}

async function postToPlatform(
  platform: PlatformId,
  text: string,
  images?: ImageAttachment[],
  cw?: string,
  visibility?: 'public' | 'unlisted' | 'private' | 'direct',
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
    // P17: cache > probe > override > default の有効値で check
    const effective = adapter.videoConstraints
      ? await getEffectiveVideoConstraints(platform, adapter.videoConstraints)
      : null;
    if (effective) {
      const durationS = videoItem.durationS ?? 0;
      const bytes = attachmentSize(videoItem);
      if (effective.maxDurationS > 0 && durationS > effective.maxDurationS) {
        return {
          type: 'POST_RESULT', platform, success: false,
          error: `尺が長すぎます(上限 ${effective.maxDurationS}s、実際 ${Math.round(durationS)}s)`,
        };
      }
      if (effective.maxBytes > 0 && bytes > effective.maxBytes) {
        const limitMB = Math.round(effective.maxBytes / 1024 / 1024);
        const actualMB = Math.round(bytes / 1024 / 1024);
        return {
          type: 'POST_RESULT', platform, success: false,
          error: `ファイルサイズが大きすぎます(上限 ${limitMB}MB、実際 ${actualMB}MB)`,
        };
      }
    }
  } else if (images && images.length > 0) {
    // 画像の制約チェック(動画がない場合のみ、画像と動画は排他)。
    // v0.4.95: validation 前に per-platform で resize する。 旧 path は
    // 4.8MB の写真を 2MB 上限 (Bluesky) に当てて即 reject していたが、
    // maybeResizeImagesForPlatform で先に縮小すれば validation を通過し
    // 投稿できる (tutti-issues#32)。 失敗時のみ checkImageConstraint で
    // 拒否される (resize できない / それでも超過する場合の最終 fallback)。
    images = await maybeResizeImagesForPlatform(adapter, images);
    const err = checkImageConstraint(
      platform,
      images.map((img) => attachmentSize(img)),
    );
    if (err) {
      return { type: 'POST_RESULT', platform, success: false, error: err };
    }
  }

  // v0.4.62: IG は default crop が 1:1 のため横長/縦長写真の端が見切れる。
  // Tutti 側で正方形 letterbox (ぼかし背景 + 中央配置) に変換して、
  // 画像全体を保ちながら IG の 1:1 制約に合わせる。他 platform には影響なし。
  if (adapter.id === 'instagram' && images && images.length > 0) {
    const hasVideo = images.some((m) => m.type.startsWith('video/'));
    if (!hasVideo) {
      images = await letterboxImagesForInstagram(images);
    }
  }

  const chunks = splitText(text, adapter.charLimit);

  // v0.4.94: X / Bluesky multi-chunk は **inline thread compose** で送る
  // (preview / autoPost 両方)。 SNS UI 側の 「+」 button で chunk を追加する
  // 流れで、 user は全 chunk を 1 つの compose 画面で視覚的に確認できる。
  // (v0.4.93 は chunks[0] だけ preview する妥協で 「全然動いてない」 と user に
  // 映る欠陥があった)
  //
  // autoPost ON で X / Bluesky は inline thread → 一括 Post (1 click で thread 連結
  // 投稿される)。 失敗時は当該 SNS の compose modal が残るので user が直接修正可。
  if ((adapter.id === 'x' || adapter.id === 'bluesky') && chunks.length > 1) {
    return await postSingleChunkInlineThread(adapter, chunks, images);
  }

  // 旧 Bluesky reply chain (autoPost ON で ATProto API 経由) は v0.4.94 で
  // inline thread compose に統合済。 必要なら postBlueskyThread() は残ってる。

  // chunks > 1 (X / Bluesky 以外) は reply chain (thread 連結) で post する (v0.4.67〜)。
  // 各 SNS で chunk i+1 を chunk i への reply として post する path を用意:
  //   X: chunk 0 を /home の inline compose で post → URL capture →
  //      tweet_id 抽出 → chunk 1 を /intent/post?in_reply_to=<id>
  //      で post → 繰り返し
  //   他 SNS: 当面 generic loop (別 post として連投)。 後続 PR で reply chain 化。
  let prevPostUrl: string | undefined;
  for (let i = 0; i < chunks.length; i++) {
    if (i > 0) await sleep(CHUNK_INTERVAL_MS);
    const chunkImages = i === 0 ? images : undefined;

    // X reply chain: chunk i (i >= 1) は前 chunk への reply。
    // X intent URL の reply param は `in_reply_to=` (probe 2026-05-22 で確定。
    // `in_reply_to_status_id=` だと "Replying to @" が出ず別 tweet として扱われる)
    let overrideUrl: string | undefined;
    if (adapter.id === 'x' && i > 0 && prevPostUrl) {
      const m = prevPostUrl.match(/\/status\/(\d+)/);
      if (m && m[1]) {
        overrideUrl = `https://x.com/intent/post?in_reply_to=${m[1]}`;
      }
    }

    try {
      // v0.4.58: 1 chunk 目だけ自動 retry (1 回限り)。
      // 2 chunk 目以降は retry すると重複投稿のリスクがある (前の chunk が
      // 部分的に成功しているケース) ので retry しない。
      let result: PostResultMessage;
      if (i === 0) {
        result = await postSingleChunkWithRetry(adapter, chunks[i]!, chunkImages, undefined, overrideUrl, cw, visibility);
      } else {
        result = await postSingleChunk(adapter, chunks[i]!, chunkImages, undefined, overrideUrl, cw, visibility);
      }
      if (result.url) prevPostUrl = result.url;
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

  // 最後 chunk の URL を返す (popup で thread の先頭/末尾どちらに飛ぶかは UI で決める)
  const finalResult: PostResultMessage = { type: 'POST_RESULT', platform, success: true, url: prevPostUrl };

  // post 後 verify (v0.4.75〜): 本文 / 画像 / tag が SNS 側で実際に書き込まれたか確認。
  // verify は best-effort、 失敗しても投稿自体の成否には影響しない。
  if (prevPostUrl && isVerifySupported(platform)) {
    const expectation = {
      text,
      hasImages: !!(images && images.length > 0),
      // expectedTags は per-SNS で extractHashtags すべきだが、 ここでは未指定で OK
      // (current verify は本文 + image 主体、 専用 tag field の verify は将来 phase)
    };
    try {
      const v = await runVerify(platform, prevPostUrl, expectation);
      finalResult.verify = {
        verified: v.verified,
        issues: v.issues,
      };
      const hardErrors = v.issues.filter((i) => i.severity === 'error');
      if (hardErrors.length > 0) {
        log.warn(`${platform} verify: ${hardErrors.length} error - ${hardErrors[0]!.message}`);
      }
    } catch (e) {
      log.warn(`${platform} verify failed (post 自体は成功): ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // 投稿成功後、 設定に応じて post URL を新タブで自動 open (v0.4.77〜)。
  // default 'on-issue' = verify error 時のみ open (user に事故確認を促す)。
  if (prevPostUrl) {
    void maybeAutoOpenPostUrl(prevPostUrl, finalResult.verify);
  }

  return finalResult;
}

async function maybeAutoOpenPostUrl(
  url: string,
  verify: PostResultMessage['verify'],
): Promise<void> {
  try {
    const { autoOpenPostUrl } = await getSettings();
    if (autoOpenPostUrl === 'never') return;
    const hasError =
      verify && verify.issues.some((i) => i.severity === 'error' || i.kind === 'verify-error');
    if (autoOpenPostUrl === 'on-issue' && !hasError) return;
    // 'always' or ('on-issue' AND hasError)
    await browser.tabs.create({ url, active: false });
    log.info(`auto-open post URL: ${url} (autoOpenPostUrl=${autoOpenPostUrl}, hasError=${!!hasError})`);
  } catch (e) {
    log.warn(`auto-open failed: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/**
 * v0.4.94: X / Bluesky の multi-chunk を inline thread compose で送る。
 * 1 つの compose modal に全 chunks を「+」 button で追加して 1 click 投稿する流れ。
 * content script の runPost を `textChunks` 付きで呼んで、 X / Bluesky の
 * content script 側で inline thread を組み立てる。
 */
async function postSingleChunkInlineThread(
  adapter: PlatformAdapter,
  chunks: string[],
  images?: ImageAttachment[],
): Promise<PostResultMessage> {
  log.info(`${adapter.id}: inline thread compose で ${chunks.length} chunks を 1 つの compose に並べる`);
  // text は join (split で消えた区切りを再構成、 content script 側で再分割しない)
  // content script は textChunks を見て分割済みとして扱う。
  return await postSingleChunk(adapter, chunks[0]!, images, chunks);
}

/**
 * postSingleChunk を最大 2 回呼ぶ wrapper (v0.4.58)。失敗時に 1 回だけ自動 retry。
 *
 * 条件:
 *   - autoPost ON のときだけ retry (preview モードは selector / UI mismatch が
 *     原因で失敗することが多く、retry しても同じ場所で詰まるため無意味)
 *   - retry の前に 1.5s sleep して SNS 側 transient state の落ち着きを待つ
 *
 * 「自動再試行 (1 回だけ) + 失敗 SNS の手動再送 UI」の前半に対応。
 * 完全な復旧は popup 側の再送 UI に委ねる。
 */
async function postSingleChunkWithRetry(
  adapter: PlatformAdapter,
  text: string,
  rawImages?: ImageAttachment[],
  textChunks?: string[],
  overrideUrl?: string,
  cw?: string,
  visibility?: 'public' | 'unlisted' | 'private' | 'direct',
): Promise<PostResultMessage> {
  // v0.4.100: auto-retry を撤去 (user 報告 2026-05-23、 Threads で同じ投稿が
  // 2 回されてた)。 旧 path は waitForPostUrl の verify 失敗 (post 自体は成功
  // していても URL capture が timeout 等) で throw → 1.5s 後に retry → 実 post
  // が 2 回走る事故。 post は非 idempotent なので auto-retry は構造的に不安全。
  // 失敗時は popup の 「失敗だけ再送」 button で user が明示的に retry する。
  return await postSingleChunk(adapter, text, rawImages, textChunks, overrideUrl, cw, visibility);
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

/**
 * IG 用に画像を正方形 letterbox 変換 (v0.4.62)。横長/縦長写真の端が IG default
 * 1:1 crop で見切れる問題を回避。dataRef だけの大画像は resolve してから変換。
 * 変換失敗は warn のみで元画像にフォールバック (= 既存挙動 = 1:1 で見切れる)。
 */
async function letterboxImagesForInstagram(
  images: ImageAttachment[],
): Promise<ImageAttachment[]> {
  return await Promise.all(
    images.map(async (img) => {
      try {
        // base64 を持ってない (= dataRef のみ) なら resolve
        let data = img.data;
        if (!data) {
          const resolved = await resolveAttachmentToBase64(img);
          data = resolved.data;
        }
        if (!data) throw new Error('letterbox: data missing after resolve');
        const out = await letterboxToSquare(data, img.type);
        if (!out.changed) return img; // 既に square、元の object のまま
        return {
          name: img.name.replace(/\.[^.]+$/, '.jpg'),
          type: out.type,
          data: out.data,
          // letterbox 後は別 binary なので dataRef は外して data のみで運ぶ
        };
      } catch (e) {
        log.warn(`IG letterbox 失敗、元画像で続行: ${e instanceof Error ? e.message : String(e)}`);
        return img;
      }
    }),
  );
}

/**
 * Bluesky thread (reply chain) を ATProto API で post する (v0.4.68〜)。
 *
 * 認証戦略:
 *   1. Settings に Bluesky API credentials が設定済 → createSession 経由 (DOM
 *      非依存、 bsky.app タブを開かなくて済む)
 *   2. credentials 無し → bsky.app タブを開いて GET_BLUESKY_SESSION で
 *      localStorage の session JWT を借りる
 *
 * Reply chain:
 *   - chunk 0: 通常の post + uri/cid 取得
 *   - chunk 1+: reply.root + reply.parent を chunk 0 (root) と直前 chunk
 *     (parent) で連結
 */
async function postBlueskyThread(
  adapter: PlatformAdapter,
  chunks: string[],
  images?: ImageAttachment[],
): Promise<PostResultMessage> {
  const { autoPost } = await getSettings();
  if (!autoPost) {
    // preview モードで thread を「動作確認」 する path は当面サポートしない
    // (API 経由なので preview 概念に意味が無い)。 generic loop に流す。
    throw new Error('Bluesky thread は autoPost ON 限定 (preview 不可)');
  }

  // session を取得
  const creds = await getApiCredentials();
  let session: { accessJwt: string; did: string; handle: string; pdsHost?: string } | null = null;

  if (creds.bluesky) {
    // credentials 経由: createSession して取得 (postBlueskyApi が内部でやってるのを直接)
    const c = creds.bluesky;
    const pds = c.pdsHost || 'https://bsky.social';
    const res = await fetch(`${pds}/xrpc/com.atproto.server.createSession`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: c.identifier, password: c.appPassword }),
    });
    if (!res.ok) throw new Error(`Bluesky createSession ${res.status}`);
    const data = (await res.json()) as { accessJwt: string; did: string; handle: string };
    session = { ...data, pdsHost: pds };
  } else {
    // localStorage 経由: bsky.app タブを開いて content script に session を取らせる
    const { tab } = await openOrFocusTab('https://bsky.app/', adapter.matchUrl, false);
    if (typeof tab.id !== 'number') throw new Error('bsky.app タブを開けません');
    // content script の準備を待つ
    await sleep(2000);
    const resp = await browser.tabs.sendMessage(tab.id, { type: 'GET_BLUESKY_SESSION' }) as
      | { type: 'BLUESKY_SESSION_RESULT'; accessJwt: string; did: string; handle: string; pdsHost?: string }
      | null;
    if (!resp || resp.type !== 'BLUESKY_SESSION_RESULT') {
      throw new Error('Bluesky: bsky.app の localStorage から session を取得できませんでした (ログイン済みか確認)');
    }
    session = { accessJwt: resp.accessJwt, did: resp.did, handle: resp.handle, pdsHost: resp.pdsHost };
  }

  // chunks を順次 post (reply chain)
  let rootRef: { uri: string; cid: string } | undefined;
  let parentRef: { uri: string; cid: string } | undefined;
  let lastUrl: string | undefined;
  for (let i = 0; i < chunks.length; i++) {
    const chunkImages = i === 0 ? images : undefined;
    const replyTarget: BlueskyReplyTarget | undefined = rootRef && parentRef ? {
      rootUri: rootRef.uri, rootCid: rootRef.cid,
      parentUri: parentRef.uri, parentCid: parentRef.cid,
    } : undefined;
    const result = await postBlueskyViaSession(session, { text: chunks[i]!, images: chunkImages }, replyTarget);
    if (!result.success) {
      throw new Error(`Bluesky ${i + 1}/${chunks.length}: ${result.error ?? '不明'}`);
    }
    if (result.uri && result.cid) {
      if (!rootRef) rootRef = { uri: result.uri, cid: result.cid };
      parentRef = { uri: result.uri, cid: result.cid };
    }
    lastUrl = result.postUrl ?? lastUrl;
    log.info(`Bluesky thread ${i + 1}/${chunks.length} ✓ ${result.postUrl ?? ''}`);
  }

  return { type: 'POST_RESULT', platform: 'bluesky', success: true, url: lastUrl };
}

// runVerify + verifyViaDomTab は src/background/verify-dispatcher.ts に移設 (v0.4.80)。

/**
 * 設定された API credentials があれば API path で投稿。無ければ 'no-credentials'。
 * P15 で対応してるのは Bluesky / Mastodon / Misskey の 3 platforms (Phase 1)。
 */
async function tryApiPath(
  platform: PlatformId,
  text: string,
  images?: ImageAttachment[],
  cw?: string,
  visibility?: 'public' | 'unlisted' | 'private' | 'direct',
): Promise<ApiPostResult | 'no-credentials'> {
  const creds = await getApiCredentials();
  // Bluesky: alt text は images[].alt から、 cw / visibility は無視 (Bluesky の
  // content label は別 system なので別 phase)
  if (platform === 'bluesky' && creds.bluesky) {
    return await postBlueskyApi(creds.bluesky, { text, images });
  }
  // Mastodon: spoiler_text + visibility + media.description (alt) を渡す
  if (platform === 'mastodon' && creds.mastodon) {
    return await postMastodonApi(creds.mastodon, { text, images, cw, visibility });
  }
  // Misskey: cw + visibility (mapping は api/misskey.ts 内)
  if (platform === 'misskey' && creds.misskey) {
    return await postMisskeyApi(creds.misskey, { text, images, cw, visibility });
  }
  return 'no-credentials';
}

async function postSingleChunk(
  adapter: PlatformAdapter,
  text: string,
  rawImages?: ImageAttachment[],
  /** X thread mode (v0.4.56〜)。指定時は content script が text を無視して
   *  全 chunk を 1 つの compose に並べて投稿する。images は 1 個目にだけ付く */
  textChunks?: string[],
  /** adapter.getComposeUrl(text) を override (reply chain で reply target を
   *  含む URL に切り替える等)。 指定無しなら adapter の default を使う。 */
  overrideUrl?: string,
  /** content warning / spoiler (Mastodon / Misskey API path、 v0.4.87〜) */
  cw?: string,
  /** visibility (Mastodon / Misskey API path、 v0.4.87〜) */
  visibility?: 'public' | 'unlisted' | 'private' | 'direct',
): Promise<PostResultMessage> {
  // content script は extension IndexedDB を直接読めないので、binary は
  // background→content の tab.sendMessage で chunked 配信する形に変更
  // (旧コードは ここで全 base64 化して 64MB cap で死んでいた、tutti-issues#4)。
  // dataRef を持ったまま content script に渡し、content 側が GET_BINARY_CHUNK
  // で 30MB 単位で取得して assemble する。
  // API path (autoPost=true && creds) は dataRef でも data でも resolve できる
  // のでそちらは特別扱い不要。
  // v0.4.81: 画像は per-platform で resize する (Bluesky 1MB が他 SNS に伝染しない)。
  // 動画は letterbox/圧縮は handlePostRequest 上流で一括処理済 (per-platform 動画は cost 上 NG)。
  const images = rawImages ? await maybeResizeImagesForPlatform(adapter, rawImages) : undefined;
  const { autoPost } = await getSettings();

  // ── API path (P15) ─────────────────────────────────────────────
  // credentials が設定されてて autoPost=true (= 実投稿モード) のときは
  // API 直送して終了。autoPost=false (= preview モード) のときは API は使わず
  // 従来 DOM path で compose を開いてユーザーに見せる (preview の意味維持)。
  // override URL (reply chain) は DOM path 専用なので skip。
  if (autoPost && !overrideUrl) {
    const apiResult = await tryApiPath(adapter.id, text, images, cw, visibility);
    if (apiResult === 'no-credentials') {
      // 設定無し → DOM path に fallthrough
    } else if (apiResult.success) {
      log.info(`${adapter.id} via API ✓ ${apiResult.postUrl ?? ''}`);
      return { type: 'POST_RESULT', platform: adapter.id, success: true, url: apiResult.postUrl };
    } else {
      throw new Error(`API: ${apiResult.error ?? '不明なエラー'}`);
    }
  }

  // content script API は dryRun の概念で書かれているので boundary で変換。
  // autoPost: false → dryRun: true(検証だけ、Post クリックしない)
  const dryRun = !autoPost;
  // SNS タブは原則バックグラウンド(active: false)で開いて popup を残す。
  // ただし requiresForegroundTab: true な SNS (Pixiv / DeviantArt / Instagram
  // のような heavy SPA + 多段 wizard) は background だと requestAnimationFrame /
  // setTimeout がブラウザに throttle されて React state や file upload が
  // 極端に遅くなる。popup が閉じる tradeoff を許容して foreground で開く。
  const active = adapter.requiresForegroundTab === true;
  const { tab, wasCreated } = await openOrFocusTab(
    overrideUrl ?? adapter.getComposeUrl(text),
    adapter.matchUrl,
    active,
  );
  if (typeof tab.id !== 'number') {
    throw new Error('SNS タブを開けませんでした');
  }
  if (wasCreated) recordOpenedTab(adapter.id, tab.id);

  // v0.4.83: 想定 user を message に乗せて content script に渡す。
  // content script 側で post 直前に detectUser() を再走させて mismatch を検知、
  // multi-account 誤爆を防ぐ。
  const lastSeenUsers = await import('../src/storage').then((m) => m.getLastSeenUsers());
  const expectedUser = lastSeenUsers[adapter.id];

  const message: PostToPlatformMessage = {
    type: 'POST_TO_PLATFORM',
    platform: adapter.id,
    text,
    textChunks,
    images,
    dryRun,
    expectedUser,
  };
  let response: PostResultMessage | undefined;
  try {
    response = (await browser.tabs.sendMessage(
      tab.id,
      message,
    )) as PostResultMessage | undefined;
  } catch (err) {
    // SNS の compose form 送信完了直後に tab が navigation / reload する SNS
    // (Mastodon の /share?text=… 等) では、content script が sendResponse する
    // 前に message channel が閉じてしまい
    // "A listener indicated an asynchronous response by returning true, but
    //  the message channel closed before a response was received"
    // で reject される。実投稿は landing しているケースが多いので、この
    // 特定エラーは success として扱う (Tutti は楽観的に成功扱い、UI 上で確認)。
    // tutti-issues#14 (mastodon)
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('asynchronous response') || msg.includes('message channel closed')) {
      log.warn(`${adapter.id}: post 後の channel closed を成功扱い (tab navigation のため) — ${msg}`);
      return { type: 'POST_RESULT', platform: adapter.id, success: true };
    }
    throw err;
  }

  if (!response) {
    throw new Error('SNS ページが応答しません(タブを再読み込みしてください)');
  }
  if (!response.success) throw new Error(response.error ?? '投稿に失敗しました');
  return response;
}

// openOrFocusTab / waitForTabComplete / notifyResults は src/background/tab-management.ts に移設 (v0.4.80)。

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
