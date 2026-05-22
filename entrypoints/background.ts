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
} from '../src/utils/attachment';
import { fetchOverridesFrom } from '../src/utils/selector-overrides';
import { splitText } from '../src/utils/split';
import { letterboxToSquare } from '../src/utils/image-letterbox';
import { getApiCredentials } from '../src/utils/api-credentials';
import { postViaApi as postBlueskyApi, postViaSession as postBlueskyViaSession, type BlueskyReplyTarget } from '../src/api/bluesky';
import { verifyBlueskyPost } from '../src/api/bluesky-verify';
import { verifyMastodonPost } from '../src/api/mastodon-verify';
import { verifyMisskeyPost } from '../src/api/misskey-verify';
import { isVerifySupported, type VerifyExpectation, type VerifyResult } from '../src/utils/post-verify';
import { postViaApi as postMastodonApi } from '../src/api/mastodon';
import { postViaApi as postMisskeyApi } from '../src/api/misskey';
import type { ApiPostResult } from '../src/api/types';

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
 */
interface PostingState {
  platforms: PlatformId[];
  pending: Set<PlatformId>;
  results: PostResultMessage[];
  startedAt: number;
}
let postingStateInMemory: PostingState | null = null;

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

    // P19: 進捗 UI を popup 閉じ→再開でも復活させるため、background で進捗状態を覚える
    if (msg.type === 'CONVERSION_PROGRESS') {
      compressionStateInMemory = { progress: msg.progress, stage: msg.stage ?? 'transcode' };
      return; // popup 側でも listen してるので fire-and-forget
    }
    if (msg.type === 'CONVERSION_COMPLETE' || msg.type === 'CONVERSION_ERROR') {
      compressionStateInMemory = null;
      return; // 同上
    }
    if (msg.type === 'GET_BG_STATE') {
      sendResponse({
        compression: compressionStateInMemory,
        posting: postingInMemory,
        // v0.4.63: 投稿中の platform 別の進捗を popup に返す。pending / results を
        // popup 側で再現してリッチな UI を復元する。
        postingState: postingStateInMemory
          ? {
              platforms: postingStateInMemory.platforms,
              pending: Array.from(postingStateInMemory.pending),
              results: postingStateInMemory.results.slice(),
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
): Promise<PostResultMessage[]> {
  postingInMemory = true;
  postingStateInMemory = {
    platforms: [...platforms],
    pending: new Set(platforms),
    results: [],
    startedAt: Date.now(),
  };
  try {
  // P16: 動画があり、いずれかの選択中 SNS の maxBytes を超える場合は事前に圧縮
  const adjustedImages = await maybeCompressVideoForBudget(platforms, images);

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
        const result = await postToPlatform(platform, text, adjustedImages);
        results.push(result);
        // background 側の state を更新 (popup 再 open 時に GET_BG_STATE で復元される)
        if (postingStateInMemory) {
          postingStateInMemory.pending.delete(platform);
          postingStateInMemory.results.push(result);
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
  void addToPostHistory(text, results, (adjustedImages?.length ?? 0) > 0);
  // IndexedDB binary-transfer の cleanup (元 dataRef + 圧縮結果 dataRef 両方)
  void releaseAttachmentTransfers(adjustedImages);
  if (adjustedImages !== images) void releaseAttachmentTransfers(images);
  return results;
  } finally {
    postingInMemory = false;
    postingStateInMemory = null;
    compressionStateInMemory = null;
  }
}

/**
 * 選択中 SNS の最小 maxBytes を求めて、動画サイズが超えてれば offscreen に
 * 委譲して再エンコード。圧縮失敗時は元動画を返して既存 constraint check で
 * エラー報告する従来挙動に倒す (= 「最低でも今までと同等」を保証)。
 *
 * 画像のみ / 動画なしの場合は何もせず images をそのまま返す。
 */
async function maybeCompressVideoForBudget(
  platforms: PlatformId[],
  images?: ImageAttachment[],
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
  if (minBytes === Infinity) return images;
  if (currentBytes <= minBytes) return images;

  log.info(`P16: video ${(currentBytes / 1024 / 1024).toFixed(1)}MB → 目標 ${(minBytes / 1024 / 1024).toFixed(1)}MB に圧縮`);

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
      targetBytes: minBytes,
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
}): Promise<{ outputRef: string; outputBytes: number }> {
  await ensureOffscreen();
  try {
    const res = (await browser.runtime.sendMessage({
      type: 'CONVERT_VIDEO',
      inputRef: req.inputRef,
      mimeType: req.mimeType,
      durationS: req.durationS,
      targetBytes: req.targetBytes,
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
    // 画像の制約チェック(動画がない場合のみ、画像と動画は排他)
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

  // Bluesky reply chain (v0.4.68): chunks > 1 のとき ATProto API で thread 連結
  // reply として post する。 user が API credentials を設定してなくても、
  // bsky.app に既にログインしてれば content script 経由で session JWT を借りる。
  if (adapter.id === 'bluesky' && chunks.length > 1) {
    try {
      const r = await postBlueskyThread(adapter, chunks, images);
      return r;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.warn(`Bluesky reply chain 失敗、 generic loop に fallback: ${msg}`);
      // fallthrough して下の generic loop で個別 post する
    }
  }

  // chunks > 1 は reply chain (thread 連結) で post する (v0.4.67〜)。
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
        result = await postSingleChunkWithRetry(adapter, chunks[i]!, chunkImages, undefined, overrideUrl);
      } else {
        result = await postSingleChunk(adapter, chunks[i]!, chunkImages, undefined, overrideUrl);
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

  return finalResult;
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
): Promise<PostResultMessage> {
  const { autoPost } = await getSettings();
  try {
    return await postSingleChunk(adapter, text, rawImages, textChunks, overrideUrl);
  } catch (err) {
    if (!autoPost) throw err;
    const msg = err instanceof Error ? err.message : String(err);
    log.warn(`${adapter.id}: 1 回目失敗 → 1.5s 後 retry — ${msg}`);
    await sleep(1500);
    return await postSingleChunk(adapter, text, rawImages, textChunks, overrideUrl);
  }
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
    const tab = await openOrFocusTab('https://bsky.app/', adapter.matchUrl, false);
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

/**
 * post URL に飛んで実 verify を走らせる (v0.4.75〜)。 platform 別 dispatcher。
 * 現在対応: Bluesky / Mastodon / Misskey (public API)、 X / IG は将来 phase。
 */
async function runVerify(
  platform: PlatformId,
  postUrl: string,
  expected: VerifyExpectation,
): Promise<VerifyResult> {
  if (platform === 'bluesky') return verifyBlueskyPost(postUrl, expected);
  if (platform === 'mastodon') return verifyMastodonPost(postUrl, expected);
  if (platform === 'misskey') return verifyMisskeyPost(postUrl, expected);
  // 他 SNS は未対応 (verifyError 相当)
  return { verified: false, issues: [{ kind: 'verify-error', message: 'verify 未対応 SNS', severity: 'warn' }] };
}

/**
 * 設定された API credentials があれば API path で投稿。無ければ 'no-credentials'。
 * P15 で対応してるのは Bluesky / Mastodon / Misskey の 3 platforms (Phase 1)。
 */
async function tryApiPath(
  platform: PlatformId,
  text: string,
  images?: ImageAttachment[],
): Promise<ApiPostResult | 'no-credentials'> {
  const creds = await getApiCredentials();
  if (platform === 'bluesky' && creds.bluesky) {
    return await postBlueskyApi(creds.bluesky, { text, images });
  }
  if (platform === 'mastodon' && creds.mastodon) {
    return await postMastodonApi(creds.mastodon, { text, images });
  }
  if (platform === 'misskey' && creds.misskey) {
    return await postMisskeyApi(creds.misskey, { text, images });
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
): Promise<PostResultMessage> {
  // content script は extension IndexedDB を直接読めないので、binary は
  // background→content の tab.sendMessage で chunked 配信する形に変更
  // (旧コードは ここで全 base64 化して 64MB cap で死んでいた、tutti-issues#4)。
  // dataRef を持ったまま content script に渡し、content 側が GET_BINARY_CHUNK
  // で 30MB 単位で取得して assemble する。
  // API path (autoPost=true && creds) は dataRef でも data でも resolve できる
  // のでそちらは特別扱い不要。
  const images = rawImages;
  const { autoPost } = await getSettings();

  // ── API path (P15) ─────────────────────────────────────────────
  // credentials が設定されてて autoPost=true (= 実投稿モード) のときは
  // API 直送して終了。autoPost=false (= preview モード) のときは API は使わず
  // 従来 DOM path で compose を開いてユーザーに見せる (preview の意味維持)。
  // override URL (reply chain) は DOM path 専用なので skip。
  if (autoPost && !overrideUrl) {
    const apiResult = await tryApiPath(adapter.id, text, images);
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
  const tab = await openOrFocusTab(
    overrideUrl ?? adapter.getComposeUrl(text),
    adapter.matchUrl,
    active,
  );
  if (typeof tab.id !== 'number') {
    throw new Error('SNS タブを開けませんでした');
  }

  const message: PostToPlatformMessage = {
    type: 'POST_TO_PLATFORM',
    platform: adapter.id,
    text,
    textChunks,
    images,
    dryRun,
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

async function openOrFocusTab(
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
function waitForTabComplete(tabId: number): Promise<void> {
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
