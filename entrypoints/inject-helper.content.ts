/**
 * MAIN world で動く file-input 注入ヘルパ。
 *
 * Why MAIN world?
 *   ISOLATED world から `Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'files').set`
 *   を取ると、それは ISOLATED world 側の prototype の native setter になる。
 *   React/Vue/Svelte などはページ自身(MAIN world)の prototype を monkey-patch して
 *   "input.value setter が呼ばれた" 検出をしているので、ISOLATED 側の setter を呼んでも
 *   フレームワーク側の onChange ハンドラは発火しない。
 *   実機検証(2026-04-30) で Mastodon は MAIN world 注入のみ反応することを確認。
 *
 * 動作:
 *   1. ISOLATED 側から window.postMessage({ source: REQ_TAG, id, mode, selector, files: [...] })
 *   2. inject (input setter / drop event dispatch) で SNS 側のアップロード処理を起動
 *   3. fetch / XHR を hook してアップロード API への in-flight count を監視し、
 *      固定 sleep ではなく "アップロード完了" を確実に待つ。
 *   4. 待機完了後 window.postMessage({ source: RES_TAG, id, ok, fileCount?, uploadCount? })
 */

import {
  installNetworkObserver,
  type NetworkCaptureRule,
  type NetworkObserverDiagnostic,
  type NetworkObserverTag,
} from '../src/page-world/network-observer';
import { extractMediaUploadFailure } from '../src/page-world/media-upload-result';
import {
  createPagePostCaptureRules,
  type PostCapturePendingState,
  type PostCapturePlatform,
  type PostCaptureResult,
} from '../src/page-world/post-capture-rules';
import {
  decodeInjectRequestMode,
  dispatchInjectRequest,
  type InjectRequestHandlerMap,
  type InjectRequestMode,
} from '../src/page-world/request-mode-dispatch';
import {
  findElementBySelectorList,
  handleClickCommand,
  handleTagListCommand,
} from '../src/page-world/element-commands';
import { createMediaCommandHandlers } from '../src/page-world/media-commands';
import {
  injectContentEditableText,
  injectXDraftText,
  injectNativeText,
  resolveTextEditorDriver,
  shouldUseDirectLexicalState,
  shouldUseXEditorPaste,
} from '../src/page-world/editor-drivers';
import { handleTumblrTextCommand } from '../src/page-world/tumblr-editor-driver';

const REQ_TAG = 'tutti-inject-req-v1';
const RES_TAG = 'tutti-inject-res-v1';

const SNS_HOSTS = [
  'https://x.com/*',
  'https://twitter.com/*',
  'https://bsky.app/*',
  'https://www.threads.com/*',
  'https://www.threads.net/*',
  'https://threads.net/*',
  'https://mastodon.social/*',
  'https://misskey.io/*',
  'https://www.tumblr.com/*',
  'https://tumblr.com/*',
  'https://www.pixiv.net/*',
  'https://pixiv.net/*',
  'https://www.deviantart.com/*',
  'https://deviantart.com/*',
  'https://www.instagram.com/*',
  'https://instagram.com/*',
  'https://www.tiktok.com/*',
  'https://tiktok.com/*',
  'https://*.youtube.com/*',
  'https://youtube.com/*',
];

interface InjectFileSpec {
  name: string;
  type: string;
  /** base64-encoded binary content. base64 を ISOLATED→MAIN で
   *  そのまま運ぶことで postMessage / sendMessage の型変換ぶれを完全に回避する */
  data: string;
}

interface InjectRequest {
  source: typeof REQ_TAG;
  id: string;
  /**
   * 'input' = file input にセット
   * 'drop'  = drag&drop イベント dispatch
   * 'text'  = contenteditable / textarea にテキスト挿入(React/Lexical 等の
   *           framework が ISOLATED world からの execCommand だと反応しない
   *           ケースのために MAIN world で実行する)
   * 'tag-list' = Pixiv の tag input のような「value 入力 → Enter で確定 →
   *           input がクリア → 次の値」を繰り返す UI。tags[] を順次入れる
   */
  mode: InjectRequestMode;
  selector: string;
  files: InjectFileSpec[];
  /** mode === 'text' 専用: 挿入するテキスト */
  text?: string;
  /** mode === 'x-post-url' 専用: この時刻より古い capture record を拒否する */
  minCapturedAt?: number;
  /** mode === 'tag-list' 専用: 順次 commit する tag 列 */
  tags?: string[];
  /** mode === 'click' 専用: 候補が複数ある場合に許可する完全一致テキスト */
  texts?: string[];
  /** アップロード完了待ちのタイムアウト(ms)。省略時 30000 */
  uploadTimeoutMs?: number;
  /** video file で upload/preview evidence を必須にするか。省略時 true */
  requireVideoAccepted?: boolean;
  /** image/video を問わず upload/preview evidence を必須にする */
  requireMediaAccepted?: boolean;
  /** upload 完了だけでなく compose preview evidence を必須にする */
  requireMediaPreview?: boolean;
  /** previewだけでは受理せず、upload resourceの完了通知を必須にする */
  requireUploadComplete?: boolean;
}

interface InjectResponse {
  source: typeof RES_TAG;
  id: string;
  ok: boolean;
  phase?: 'media-dispatched';
  error?: string;
  fileCount?: number;
  /** drop モードで使った target tag */
  droppedOn?: string;
  /** 待機中に検出された成功アップロード数 */
  uploadCount?: number;
  /** upload request が見えない UI で、プレビュー描画により添付受付を確認した */
  acceptedByPreview?: boolean;
  /** アップロード待機がタイムアウトしたか */
  uploadTimedOut?: boolean;
  url?: string;
}

interface UploadTracker {
  successCount: number;
  lastSuccessAt: number;
  failureCount: number;
  lastFailureAt: number;
  lastError?: string;
}

declare global {
  interface Window {
    __tuttiUploadHookInstalled?: boolean;
    __tuttiUpload?: UploadTracker;
    /**
     * IG の `/api/v1/media/configure/` への submit 時に caption=& (空文字)
     * になる問題の workaround (v0.4.69〜)。 ISOLATED 側 IG content script が
     * 投稿前にこの window 変数に caption を格納すると、 MAIN world の fetch
     * hook が send 時に body の `caption=` を `caption=<encoded>` に置換する。
     * 投稿後 (or 失敗時) に IG 側が clear する責任。
     */
    __tuttiIgPendingCaption?: string;
    __tuttiIgLatestPost?: { url?: string; code?: string; capturedAt: number; textHash?: string };
    __tuttiMastodonLatestPost?: { url?: string; id?: string; capturedAt: number; textHash?: string };
    __tuttiThreadsLatestPost?: { url?: string; code?: string; username?: string; capturedAt: number; textHash?: string };
    __tuttiTumblrLatestPost?: { url?: string; id?: string; blogName?: string; capturedAt: number; textHash?: string };
    __tuttiXLatestPostId?: { id: string; capturedAt: number };
    __tuttiNetObserver?: NetworkObserverTag;
    __tuttiNetObserverDiagnostics?: NetworkObserverDiagnostic[];
  }
}

export default defineContentScript({
  matches: SNS_HOSTS,
  world: 'MAIN',
  runAt: 'document_start',
  main() {
    /**
     * SNS のメディアアップロード API URL を判定する正規表現。
     * 検証済み(2026-04-30):
     *   - X: upload.x.com/i/media/upload.json (multi-step: INIT/APPEND/FINALIZE)
     *   - Mastodon: /api/v2/media
     *   - Threads: /rupload_igphoto/fb_uploader_NNN(Instagram 系の rupload)
     *   - Bluesky: 添付時にはアップロードしない(post 送信時にまとめて upload)
     *   - Misskey: /api/drive/files/create
     *   - Tumblr: /api/v2/media/image
     * \b で囲まないのは Threads "rupload" のように単語境界を持たないパスを
     * 拾うため(false positive のリスクは小、悪化しても 4s で給付諦め)。
    */
    const UPLOAD_URL_RE = /(upload|uploadBlob|drive\/files|api\/v\d+\/media)/i;
    const NETWORK_OBSERVER_OWNER = 'tutti/inject-helper';
    const NETWORK_OBSERVER_REVISION = 1;

    function readPostCapturePending(
      platform: PostCapturePlatform,
    ): PostCapturePendingState {
      try {
        if (platform === 'instagram') {
          return { caption: window.__tuttiIgPendingCaption };
        }
        if (platform === 'mastodon') {
          return {
            textHash: localStorage.getItem('tutti:mastodon-pending-text-hash') ?? undefined,
          };
        }
        if (platform === 'tumblr') {
          return {
            textHash: localStorage.getItem('tutti:tumblr-pending-text-hash') ?? undefined,
            blogName: localStorage.getItem('tutti:tumblr-pending-blog') ?? undefined,
          };
        }
        if (platform === 'threads') {
          return {
            textHash: localStorage.getItem('tutti:threads-pending-text-hash') ?? undefined,
            username: localStorage.getItem('tutti:threads-pending-user') ?? undefined,
          };
        }
      } catch {
        // Capture remains best-effort when page storage is unavailable.
      }
      return {};
    }

    function persistPostCapture(result: PostCaptureResult): void {
      const { platform, record } = result;
      if (platform === 'instagram') {
        window.__tuttiIgLatestPost = record;
        persistCaptureRecord('tutti:ig-latest-post', record);
        window.__tuttiIgPendingCaption = undefined;
      } else if (platform === 'mastodon') {
        window.__tuttiMastodonLatestPost = record;
        persistCaptureRecord(
          'tutti:mastodon-latest-post',
          record,
          ['tutti:mastodon-pending-text-hash'],
        );
      } else if (platform === 'tumblr') {
        window.__tuttiTumblrLatestPost = record;
        persistCaptureRecord(
          'tutti:tumblr-latest-post',
          record,
          ['tutti:tumblr-pending-text-hash', 'tutti:tumblr-pending-blog'],
        );
      } else if (platform === 'threads') {
        window.__tuttiThreadsLatestPost = record;
        persistCaptureRecord(
          'tutti:threads-latest-post',
          record,
          ['tutti:threads-pending-text-hash', 'tutti:threads-pending-user'],
        );
      } else {
        const captured = { id: record.id!, capturedAt: record.capturedAt };
        window.__tuttiXLatestPostId = captured;
        persistCaptureRecord('tutti:x-latest-post', captured);
      }
      console.log(
        `[Tutti inject-helper] ${platform} post captured: ${record.url ?? record.id ?? 'record'}`,
      );
    }

    function persistCaptureRecord(
      key: string,
      record: unknown,
      clearKeys: readonly string[] = [],
    ): void {
      try {
        localStorage.setItem(key, JSON.stringify(record));
        for (const clearKey of clearKeys) localStorage.removeItem(clearKey);
      } catch {
        // In-memory capture remains available.
      }
    }

    function recordNetworkObserverDiagnostic(
      diagnostic: NetworkObserverDiagnostic,
    ): void {
      const safeDiagnostic = {
        ...diagnostic,
        message: diagnostic.message
          .replace(/https?:\/\/\S+/gi, '[url]')
          .slice(0, 160),
      };
      window.__tuttiNetObserverDiagnostics = [
        ...(window.__tuttiNetObserverDiagnostics ?? []),
        safeDiagnostic,
      ].slice(-20);
      console.warn('[Tutti inject-helper] network observer:', safeDiagnostic);
    }

    function installPostCaptureObserver(): void {
      const uploadFailureRule: NetworkCaptureRule = {
        id: 'media-upload-failure',
        prepare: (request) => (
          UPLOAD_URL_RE.test(request.url)
            ? {}
            : null
        ),
        capture: (payload) => {
          const failure = extractMediaUploadFailure(payload);
          if (failure) recordUploadFailure(failure);
        },
      };
      const rules = [
        ...createPagePostCaptureRules({
          host: location.host,
          origin: location.origin,
          readPending: readPostCapturePending,
          onCaptured: persistPostCapture,
        }),
        uploadFailureRule,
      ];
      installNetworkObserver(window, {
        owner: NETWORK_OBSERVER_OWNER,
        revision: NETWORK_OBSERVER_REVISION,
        rules,
        reportDiagnostic: recordNetworkObserverDiagnostic,
      });
    }

    function installUploadHook() {
      if (window.__tuttiUploadHookInstalled) return;
      window.__tuttiUploadHookInstalled = true;
      window.__tuttiUpload = {
        successCount: 0,
        lastSuccessAt: 0,
        failureCount: 0,
        lastFailureAt: 0,
      };
      const tracker = window.__tuttiUpload;

      // PerformanceObserver は fetch / XHR / img src など出処を問わず全リクエストの
      // 完了タイミングを通知するので、SNS 側が window.fetch をラップして
      // captureしていても確実に検知できる(2026-04-30 検証で Tumblr/Misskey/
      // Bluesky/Threads が page-side で fetch を内部 wrap していて
      // window.fetch 上書きが効かないことを確認したのでこちらに切替)。
      try {
        const obs = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            const e = entry as PerformanceResourceTiming;
            if (UPLOAD_URL_RE.test(e.name)) {
              const responseStatus = 'responseStatus' in e
                ? Number(e.responseStatus)
                : 0;
              if (responseStatus >= 400) {
                recordUploadFailure(`Media upload failed (HTTP ${responseStatus}).`);
                continue;
              }
              tracker.successCount++;
              tracker.lastSuccessAt = Date.now();
            }
          }
        });
        obs.observe({ type: 'resource', buffered: true });
      } catch (e) {
        console.warn('[Tutti inject-helper] PerformanceObserver unavailable:', e);
      }
    }

    function recordUploadFailure(message: string): void {
      const tracker = window.__tuttiUpload ?? {
        successCount: 0,
        lastSuccessAt: 0,
        failureCount: 0,
        lastFailureAt: 0,
      };
      tracker.failureCount += 1;
      tracker.lastFailureAt = Date.now();
      tracker.lastError = message.slice(0, 300);
      window.__tuttiUpload = tracker;
    }

    function sleep(ms: number): Promise<void> {
      return new Promise((r) => setTimeout(r, ms));
    }

    /**
     * SNS のサーバアップロードが完了するまで待つ。
     * 戦略(PerformanceObserver で completion 時刻のみが分かる):
     *   - 少なくとも 1 回 upload-pattern URL で resource entry が来た +
     *     直近 800ms 以内に新規 entry なし → 完了
     *   - 通常添付: 4 秒待っても entry 0 件 → アップロード対象なしと判断して return
     *   - 動画添付: upload または compose preview が確認できるまで待つ
     *   - timeoutMs 超え → タイムアウト返却
     */
    async function waitForUploadComplete(
      timeoutMs: number,
      options: {
        requireMediaAccepted?: boolean;
        requirePreviewAccepted?: boolean;
        requireUploadComplete?: boolean;
        isMediaPreviewVisible?: () => boolean;
        getMediaRejectionMessage?: () => string | undefined;
      } = {},
    ): Promise<{ uploadCount: number; timedOut: boolean; acceptedByPreview: boolean; error?: string }> {
      if (!window.__tuttiUpload) {
        console.warn('[Tutti inject-helper] upload tracker was missing; recreating');
        window.__tuttiUpload = {
          successCount: 0,
          lastSuccessAt: 0,
          failureCount: 0,
          lastFailureAt: 0,
        };
      }
      const tracker = window.__tuttiUpload;
      const startCount = tracker.successCount;
      const startFailureCount = tracker.failureCount;
      const start = Date.now();
      const deadline = start + timeoutMs;
      const QUIET_MS = 800;
      // Bluesky のように attach 時にアップロードしない SNS のために 4s で諦める
      // (アップロードする SNS は ~500ms 以内に最初のリクエストが飛ぶので十分)
      const NO_UPLOAD_GIVE_UP_MS = 4000;

      while (Date.now() < deadline) {
        const newSuccess = tracker.successCount - startCount;
        const newFailure = tracker.failureCount - startFailureCount;
        const elapsed = Date.now() - start;
        if (newFailure > 0) {
          return {
            uploadCount: newSuccess,
            timedOut: false,
            acceptedByPreview: false,
            error: tracker.lastError ?? 'Media upload failed.',
          };
        }
        const rejection = options.getMediaRejectionMessage?.();
        if (rejection) {
          return {
            uploadCount: newSuccess,
            timedOut: false,
            acceptedByPreview: false,
            error: rejection,
          };
        }
        const acceptedByPreview = !!options.isMediaPreviewVisible?.();

        if (newSuccess > 0) {
          const sinceLast = Date.now() - tracker.lastSuccessAt;
          if (sinceLast >= QUIET_MS) {
            if (options.requirePreviewAccepted && !acceptedByPreview) {
              await sleep(150);
              continue;
            }
            return { uploadCount: newSuccess, timedOut: false, acceptedByPreview };
          }
        } else if (
          acceptedByPreview &&
          options.requireMediaAccepted &&
          !options.requireUploadComplete
        ) {
          return { uploadCount: 0, timedOut: false, acceptedByPreview: true };
        } else if (!options.requireMediaAccepted && elapsed >= NO_UPLOAD_GIVE_UP_MS) {
          return { uploadCount: 0, timedOut: false, acceptedByPreview: false };
        }
        await sleep(150);
      }
      return {
        uploadCount: tracker.successCount - startCount,
        timedOut: true,
        acceptedByPreview: !!options.isMediaPreviewVisible?.(),
      };
    }

    function isVisibleMediaElement(el: HTMLElement): boolean {
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      return rect.width > 4 &&
        rect.height > 4 &&
        el.getClientRects().length > 0 &&
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        style.opacity !== '0';
    }

    function mediaPreviewText(el: HTMLElement): string {
      return [
        el.getAttribute('alt'),
        el.getAttribute('aria-label'),
        el.getAttribute('data-testid'),
        el.getAttribute('class'),
        el.getAttribute('src'),
        el.textContent,
      ].filter(Boolean).join(' ').toLowerCase();
    }

    function isLikelyAttachmentImage(el: HTMLImageElement): boolean {
      const rect = el.getBoundingClientRect();
      const text = mediaPreviewText(el);
      if (text.includes('profile picture') || text.includes('profile_pic') || text.includes('avatar')) return false;
      if (el.currentSrc.startsWith('blob:') || el.currentSrc.startsWith('data:')) return true;
      return rect.width >= 80 && rect.height >= 80;
    }

    function isLikelyMediaPreviewElement(el: HTMLElement): boolean {
      if (!isVisibleMediaElement(el)) return false;
      const tag = el.tagName.toLowerCase();
      if (tag === 'video' || tag === 'canvas') return true;
      if (tag === 'img') return isLikelyAttachmentImage(el as HTMLImageElement);
      const text = mediaPreviewText(el);
      if (text.includes('attach media') || text.includes('add media')) return false;
      if (text.includes('attach video') || text.includes('add video')) return false;
      if (el.querySelector('video, canvas, img')) return true;
      const isRemoveControl = /remove|delete|削除|取り除/i.test(text);
      if (!isRemoveControl) return false;
      return /media|image|video|attachment|画像|動画|添付/i.test(text);
    }

    function mediaPreviewScope(target: HTMLElement): ParentNode {
      return target.closest('[role="dialog"], [data-testid="composer"], form, main') ?? document.body;
    }

    function countMediaPreviews(scope: ParentNode): number {
      const selectors = [
        'video',
        'canvas',
        'img',
        '[data-testid*="video" i]',
        '[data-testid*="media" i]',
        '[data-testid*="attachment" i]',
        '[aria-label*="video" i]',
        '[aria-label*="Remove" i]',
        '[aria-label*="削除"]',
      ].join(',');
      return Array
        .from(scope.querySelectorAll<HTMLElement>(selectors))
        .filter(isLikelyMediaPreviewElement)
        .length;
    }

    function mediaAcceptedPredicate(target: HTMLElement, beforeCount: number): () => boolean {
      return () => {
        const scope = target.isConnected ? mediaPreviewScope(target) : document.body;
        return countMediaPreviews(scope) > beforeCount;
      };
    }

    function mediaRejectionMessage(target: HTMLElement): string | undefined {
      const scope = target.isConnected ? mediaPreviewScope(target) : document.body;
      const selectors = [
        '[role="alert"]',
        '[aria-live]',
        '[data-testid*="toast" i]',
        '[data-testid*="error" i]',
        '[class*="toast" i]',
        '[class*="error" i]',
        '[class*="notice" i]',
        '[class*="banner" i]',
      ].join(',');
      const candidates = Array.from(scope.querySelectorAll<HTMLElement>(selectors));
      for (const el of candidates) {
        if (!isVisibleMediaElement(el)) continue;
        const text = (el.innerText ?? el.textContent ?? '').replace(/\s+/g, ' ').trim();
        if (isMediaRejectionText(text)) return text.slice(0, 220);
      }
      const scopeText = scope instanceof HTMLElement
        ? visibleTextWithoutEditable(scope)
        : '';
      if (scopeText && scopeText.length < 4000 && isMediaRejectionText(scopeText)) {
        return scopeText.slice(0, 220);
      }
      return undefined;
    }

    function isMediaRejectionText(text: string): boolean {
      if (!text) return false;
      return /unsupported|not supported|can't upload|cannot upload|could not upload|couldn't upload|failed to upload|could not process|couldn't process/i.test(text) ||
        /(?:file type|file format|format).*(?:unsupported|not supported|invalid|not allowed|could not|couldn't|can't|cannot|failed|rejected)/i.test(text) ||
        /(?:unsupported|not supported|invalid|not allowed|could not|couldn't|can't|cannot|failed|rejected).*(?:file type|file format|format)/i.test(text) ||
        /one or more videos?.*(?:failed|could not|couldn't|cannot|can't|not uploaded|rejected|invalid)/i.test(text) ||
        /(?:failed|could not|couldn't|cannot|can't|rejected|invalid).*one or more videos?/i.test(text) ||
        /対応していません|サポートされていません|アップロードできません|処理できません|扱えません|ファイル形式|動画.*拒否|動画.*失敗/.test(text);
    }

    function visibleTextWithoutEditable(scope: HTMLElement): string {
      const clone = scope.cloneNode(true) as HTMLElement;
      for (const el of Array.from(clone.querySelectorAll('textarea, input, [contenteditable="true"]'))) {
        el.remove();
      }
      return (clone.innerText ?? clone.textContent ?? '').replace(/\s+/g, ' ').trim();
    }

    const findEl = (
      selector: string,
      options: { preferVisible?: boolean } = {},
    ): { el: HTMLElement; matchedPart: string } | null => findElementBySelectorList(selector, {
      ...options,
      isVisible: isVisibleMediaElement,
    });

    function base64ToUint8Array(b64: string): Uint8Array {
      const binary = atob(b64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      return bytes;
    }

    function buildDataTransfer(files: InjectFileSpec[]): { dt: DataTransfer } | { error: string } {
      const dt = new DataTransfer();
      for (const f of files) {
        if (typeof f.data !== 'string') {
          return { error: `file data must be base64 string, got ${typeof f.data}` };
        }
        const bytes = base64ToUint8Array(f.data);
        const blob = new Blob([bytes as BlobPart], { type: f.type });
        dt.items.add(new File([blob], f.name, { type: f.type, lastModified: Date.now() }));
      }
      return { dt };
    }

    async function injectText(req: InjectRequest): Promise<InjectResponse> {
      const found = findEl(req.selector);
      if (!found) {
        return { source: RES_TAG, id: req.id, ok: false, error: 'text target not found' };
      }
      const el = found.el;
      const text = req.text ?? '';
      let frameworkTextVerified = false;
      let requiresStableFrameworkText = false;
      let verificationElement = el;
      const editorDriver = resolveTextEditorDriver(el);
      console.log(`[Tutti inject-helper] text target matched "${found.matchedPart}" (${el.tagName})`);

      // v0.4.59: 空文字 inject は no-op で成功扱い (画像のみ投稿の正常 path)。
      // 旧コードは空文字でも paste → polling → ok 判定 (visible.length > 0) で
      // false 返してエラーになり、画像のみ投稿 (本文なし) が X / Tumblr / IG で
      // 失敗していた (user 報告 2026-05-16)。
      if (text === '') {
        return { source: RES_TAG, id: req.id, ok: true };
      }

      el.focus();

      if (editorDriver === 'native') {
        injectNativeText(el as HTMLInputElement | HTMLTextAreaElement, text);
      } else {
        // contenteditable (Draft.js / Lexical / TipTap / ProseMirror):
        // 経路 (v0.4.66〜):
        //   1) framework 判定 (data-lexical-editor 属性で Lexical を識別)
        //   2) Lexical: focus + selectAll/delete + execCommand('insertText')
        //      ← paste 経由は DOM は更新するが Lexical state が同期しない
        //         silent failure が IG で発生 (user 報告 2026-05-21: caption 空投稿)
        //   3) 他 framework: paste event → polling → textContent fallback (旧 v0.4.58 path)
        //
        // 旧 v0.4.58 paste-only path は X の文字化け (paste と execCommand の
        // 二重発火) を防ぐためだったが、 IG では paste が DOM のみ更新で state
        // 未同期になり caption 空投稿が発生。 framework 別に分岐する。
        if (/instagram\.com/.test(location.host)) {
          window.__tuttiIgPendingCaption = text;
          console.log('[Tutti inject-helper] IG pending caption set (len=' + text.length + ')');
        }
        if (editorDriver === 'lexical') {
          // IG 特有の workaround: Share click 時の `/api/v1/media/configure/`
          // への fetch で body の `caption=` が空のまま送られる問題 (Lexical state
          // を更新しても IG の submit state には伝わらない silent failure)。
          // pending caption を window 変数にセットし、 fetch hook が send 時に
          // body に inject する。
          // Lexical: 直接 editor instance に access して parseEditorState +
          // setEditorState で state を直接書き換える (v0.4.69〜)。
          //
          // 経緯:
          //   v0.4.66 (execCommand 経由) と v0.4.68 (beforeinput event 経由) の両方で
          //   Lexical の text node (`<span data-lexical-text="true">`) は created
          //   される (DOM 上は OK) が、 IG の Share submit 時の network request
          //   `caption=` 値が空文字のまま (probe-ig-network.mjs で確定)。
          //   → Lexical の React-side onChange listener (IG state に書き戻す) が
          //   合成 event では発火してない疑い (event.isTrusted = false で gate
          //   される可能性)。
          //
          //   Lexical の editor instance は contenteditable 配下の DOM element に
          //   `__lexicalEditor` property で attach されており、 MAIN world から
          //   access 可能 (probe-ig-lexical-internals.mjs で確認)。
          //   editor.parseEditorState(json) + editor.setEditorState(state) で
          //   state を直接書き換えれば、 React の update listener が trustless
          //   chain なしに onChange を発火させる。
          const findLexicalEditor = (target: HTMLElement | undefined): any => { // eslint-disable-line @typescript-eslint/no-explicit-any
            let cur: HTMLElement | null = target ?? null;
            while (cur) {
              if ((cur as any).__lexicalEditor) { // eslint-disable-line @typescript-eslint/no-explicit-any
                return (cur as any).__lexicalEditor; // eslint-disable-line @typescript-eslint/no-explicit-any
              }
              cur = cur.parentElement;
            }
            return null;
          };
          let editor: any = findLexicalEditor(el); // eslint-disable-line @typescript-eslint/no-explicit-any

          // Threads の intent URL text prefill は非BMP文字を U+FFFD に壊す。
          // Lexical state を直接置換すれば emoji / ZWJ sequence を保持でき、
          // synthetic beforeinput + input の二重処理も避けられる。
          const isThreadsHost = /threads\.(?:com|net)$/.test(location.host);
          const isXHost = /(?:^|\.)x\.com$/.test(location.hostname);
          const useDirectLexicalState = shouldUseDirectLexicalState(
            location.hostname,
            el,
          );
          const shouldRequireStableFrameworkText = isThreadsHost || isXHost;
          const useXEditorPaste = shouldUseXEditorPaste(location.hostname, el);
          if (useXEditorPaste) {
            const testId = el.getAttribute('data-testid');
            const composeRoot = el.closest<HTMLElement>('[data-tutti-x-compose-root]') ??
              el.closest<HTMLElement>('[role="dialog"]') ??
              document.body;
            const resolveCurrent = (): HTMLElement | undefined => {
              if (!testId) return el.isConnected ? el : undefined;
              const findIn = (scope: ParentNode): HTMLElement | undefined => Array
                .from(scope.querySelectorAll<HTMLElement>('[data-testid]'))
                .find((candidate) => (
                  candidate.isConnected &&
                  candidate.getAttribute('data-testid') === testId &&
                  candidate.getClientRects().length > 0 &&
                  candidate.getBoundingClientRect().width > 0 &&
                  candidate.getBoundingClientRect().height > 0
                ));
              return findIn(composeRoot) ?? findIn(document);
            };
            verificationElement = await injectXDraftText(el, text, {
              resolveCurrent,
              waitFor,
            });
            editor = null;
          } else if (useDirectLexicalState && editor && typeof editor.parseEditorState === 'function' && typeof editor.setEditorState === 'function') {
            try {
              // Threads hydration and X's unfocused-window compose can both
              // replace the editor after input. Require direct Lexical state
              // to remain present before reporting success.
              requiresStableFrameworkText = shouldRequireStableFrameworkText;
              console.log('[Tutti inject-helper] Lexical: using editor.setEditorState path');
              // Lexical の標準 state JSON 構造で新 state を組み立て
              const stateJson = {
                root: {
                  type: 'root',
                  format: '',
                  indent: 0,
                  version: 1,
                  direction: 'ltr',
                  children: [{
                    type: 'paragraph',
                    format: '',
                    indent: 0,
                    version: 1,
                    direction: 'ltr',
                    children: [{
                      type: 'text',
                      text,
                      format: 0,
                      detail: 0,
                      mode: 'normal',
                      style: '',
                      version: 1,
                    }],
                  }],
                },
              };
              const serializedState = JSON.stringify(stateJson);
              const applyLexicalState = (
                targetEditor: any, // eslint-disable-line @typescript-eslint/no-explicit-any
                targetElement: HTMLElement,
                dispatchInput = true,
              ) => {
                const nextState = targetEditor.parseEditorState(serializedState);
                targetEditor.setEditorState(nextState);
                if (dispatchInput) {
                  targetElement.dispatchEvent(new InputEvent('input', {
                    bubbles: true, data: text, inputType: 'insertText',
                  }));
                }
              };
              applyLexicalState(editor, el, false);
              console.log('[Tutti inject-helper] setEditorState completed; text =', text.slice(0, 50));
              // React の update tick を待つ
              await new Promise((r) => setTimeout(r, 500));
              // verify state has text via editor.getEditorState
              try {
                const stateNow = editor.getEditorState();
                const stateJson = stateNow.toJSON();
                const stateRoot = (stateJson as { root?: unknown }).root ?? stateJson;
                const stateText = readLexicalStateText(stateRoot);
                frameworkTextVerified = stateText.includes(text);
                console.log(
                  '[Tutti inject-helper] Lexical state after setEditorState:',
                  JSON.stringify(stateJson).slice(0, 200),
                  'textVerified=',
                  frameworkTextVerified,
                );
              } catch (e) {
                console.log('[Tutti inject-helper] state read err:', e);
              }
              // setEditorState が onChange を起こすが、補助的にinput eventも
              // dispatchしてcontrolled input listenerへ届くようにする。
              el.dispatchEvent(new InputEvent('input', {
                bubbles: true, data: text, inputType: 'insertText',
              }));
              await new Promise((r) => setTimeout(r, 100));
              // Threadsのfresh pageでは、最初のsetEditorState直後は正しくても、
              // controlled stateのhydrationが遅れて空stateを再適用することがある。
              // full textが安定して残るまで監視し、消えた場合だけstateを再適用する。
              if (requiresStableFrameworkText) {
                try {
                  const deadline = Date.now() + 5000;
                  let stableSince: number | undefined;
                  let reapplyCount = 0;
                  let finalStateJson: unknown;
                  let stableTarget: HTMLElement | undefined;
                  frameworkTextVerified = false;
                  while (Date.now() < deadline) {
                    const currentTarget = findEl(req.selector)?.el;
                    const currentEditor = findLexicalEditor(currentTarget);
                    finalStateJson = currentEditor?.getEditorState?.().toJSON();
                    const finalStateRoot = finalStateJson
                      ? (finalStateJson as { root?: unknown }).root ?? finalStateJson
                      : undefined;
                    const exactTextPresent =
                      currentTarget?.isConnected === true &&
                      readLexicalStateText(finalStateRoot) === text;
                    if (exactTextPresent) {
                      if (stableTarget !== currentTarget) {
                        stableTarget = currentTarget;
                        stableSince = Date.now();
                      }
                      if (Date.now() - (stableSince ?? Date.now()) >= 1000) {
                        frameworkTextVerified = true;
                        break;
                      }
                    } else {
                      stableTarget = undefined;
                      stableSince = undefined;
                      if (
                        reapplyCount < 2 &&
                        currentTarget &&
                        currentEditor &&
                        typeof currentEditor.parseEditorState === 'function' &&
                        typeof currentEditor.setEditorState === 'function'
                      ) {
                        reapplyCount += 1;
                        editor = currentEditor;
                        applyLexicalState(currentEditor, currentTarget);
                        console.warn(
                          `[Tutti inject-helper] Lexical editor reset after direct state update; ` +
                          `reapplied (${reapplyCount}/2)`,
                        );
                      }
                    }
                    await new Promise((r) => setTimeout(r, 100));
                  }
                  console.log(
                    '[Tutti inject-helper] stable Lexical state:',
                    JSON.stringify(finalStateJson).slice(0, 200),
                    'textVerified=',
                    frameworkTextVerified,
                    'reapplyCount=',
                    reapplyCount,
                  );
                } catch (e) {
                  frameworkTextVerified = false;
                  console.warn('[Tutti inject-helper] final Lexical state read failed:', e);
                }
              }
            } catch (e) {
              console.warn('[Tutti inject-helper] Lexical setEditorState failed, falling back to events:', e);
              requiresStableFrameworkText = false;
              editor = null; // event-based fallback に流す
            }
          } else {
            requiresStableFrameworkText = false;
            editor = null; // X 等は framework event path の方が composer state と同期しやすい
          }

          if (!editor && !useXEditorPaste) {
            // editor instance が取れない or setEditorState 失敗 → event-based fallback
            el.focus();
            const sel0 = window.getSelection();
            if (sel0) {
              try {
                sel0.removeAllRanges();
                const range = document.createRange();
                range.selectNodeContents(el);
                sel0.addRange(range);
              } catch { /* ignore */ }
            }
            // Keep the deletion scoped to this editor. document-level
            // selectAll is unreliable when the editor lives in an active tab
            // inside an unfocused browser window and can leave Lexical's old
            // state in place, causing retries to append duplicate text.
            el.dispatchEvent(new InputEvent('beforeinput', {
              bubbles: true,
              cancelable: true,
              inputType: 'deleteContentBackward',
              data: null,
            }));
            try {
              document.execCommand('delete', false);
            } catch { /* ignore */ }
            el.dispatchEvent(new InputEvent('input', {
              bubbles: true,
              inputType: 'deleteContentBackward',
              data: null,
            }));
            await new Promise((r) => setTimeout(r, 50));
            el.focus();
            const beforeEv = new InputEvent('beforeinput', {
              bubbles: true, cancelable: true, inputType: 'insertText', data: text,
            });
            el.dispatchEvent(beforeEv);
            if (!beforeEv.defaultPrevented) {
              try { document.execCommand('insertText', false, text); } catch { /* ignore */ }
              el.dispatchEvent(new InputEvent('input', {
                bubbles: true, data: text, inputType: 'insertText',
              }));
            }
            await new Promise((r) => setTimeout(r, 800));
          }
        } else if (editorDriver === 'draft') {
          // Draft.js (TikTok Studio): upload 後に filename 由来の初期 caption
          // が入る variant がある。DOM だけ消して paste すると controlled
          // state 側の旧値へ追記されるため、editor selection を全置換する。
          const visibleNow = (): string =>
            (el as HTMLElement).innerText ?? el.textContent ?? '';
          const sel = window.getSelection();
          el.focus();
          if (sel) {
            sel.removeAllRanges();
            const range = document.createRange();
            range.selectNodeContents(el);
            sel.addRange(range);
          }
          el.dispatchEvent(new InputEvent('beforeinput', {
            bubbles: true,
            cancelable: true,
            inputType: 'deleteByCut',
            data: null,
          }));
          try {
            document.execCommand('delete', false);
          } catch { /* fallback below verifies the DOM */ }
          el.dispatchEvent(new InputEvent('input', {
            bubbles: true,
            inputType: 'deleteContentBackward',
            data: null,
          }));
          await new Promise((r) => setTimeout(r, 120));

          const matchSnippet = text.slice(0, Math.min(16, text.length));
          if (text.trim().length > 0) {
            const dt = new DataTransfer();
            dt.setData('text/plain', text);
            el.dispatchEvent(new ClipboardEvent('paste', {
              bubbles: true,
              cancelable: true,
              clipboardData: dt,
            }));
            const pasted = await waitFor(
              () => visibleNow().includes(matchSnippet),
              600,
            );
            if (!pasted) {
              el.dispatchEvent(new InputEvent('beforeinput', {
                bubbles: true,
                cancelable: true,
                inputType: 'insertText',
                data: text,
              }));
              try {
                document.execCommand('insertText', false, text);
              } catch { /* fallback below verifies the DOM */ }
            }
            const inserted = await waitFor(
              () => visibleNow().includes(matchSnippet),
              600,
            );
            if (!inserted) {
              el.textContent = text;
            }
          } else if (visibleNow().trim().length > 0) {
            el.textContent = '';
          }
          el.dispatchEvent(new InputEvent('input', {
            bubbles: true, data: text, inputType: 'insertText',
          }));
          el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: text.slice(-1) || 'a' }));
          await new Promise((r) => setTimeout(r, 800));
        } else {
          await injectContentEditableText(el, text, { waitFor });
        }
      }

      // 検証。Threadsのdirect Lexical pathはhydration後のframework stateに
      // full textが残ることを必須にする。他frameworkはDOMベースで確認する。
      // input/textarea は value で厳密に判定。contenteditable は innerText が
      // 取れない / Lexical 等が DOM を再構成するので、内容が「空でないこと」だけ
      // 緩く判定する (paste / execCommand / textContent 代入のいずれかが効いたか)。
      let ok: boolean;
      if (verificationElement instanceof HTMLTextAreaElement || verificationElement instanceof HTMLInputElement) {
        ok = verificationElement.value.includes(text.slice(0, Math.min(20, text.length)));
      } else {
        // innerText を優先 (Lexical 等が span ネストする場合に textContent より確実)
        const visible = (verificationElement.innerText ?? verificationElement.textContent ?? '').trim();
        const expectedSnippet = text.slice(0, Math.min(20, text.length)).trim();
        ok = requiresStableFrameworkText
          ? frameworkTextVerified
          : frameworkTextVerified ||
            expectedSnippet === '' ||
            visible.includes(expectedSnippet) ||
            visible.replace(/\s+/g, ' ').includes(expectedSnippet.replace(/\s+/g, ' '));
      }
      return {
        source: RES_TAG,
        id: req.id,
        ok,
        error: ok ? undefined : 'text injection seems to have failed (textContent / value mismatch)',
      };
    }

    function readLexicalStateText(value: unknown): string {
      if (!value || typeof value !== 'object') return '';
      const node = value as { text?: unknown; children?: unknown };
      const ownText = typeof node.text === 'string' ? node.text : '';
      const childText = Array.isArray(node.children)
        ? node.children.map(readLexicalStateText).join('')
        : '';
      return `${ownText}${childText}`;
    }

    async function readLatestXPostUrl(req: InjectRequest): Promise<InjectResponse> {
      let captured = window.__tuttiXLatestPostId;
      try {
        captured ??= JSON.parse(localStorage.getItem('tutti:x-latest-post') ?? 'null') as typeof captured;
      } catch { /* ignore malformed or unavailable storage */ }
      const handle = req.text?.replace(/^@/, '');
      const fresh = captured && Date.now() - captured.capturedAt < 60_000;
      const afterStart = !req.minCapturedAt || (captured?.capturedAt ?? 0) >= req.minCapturedAt;
      return {
        source: RES_TAG,
        id: req.id,
        ok: true,
        url: fresh && afterStart && handle && captured ? `https://x.com/${handle}/status/${captured.id}` : undefined,
      };
    }

    /** 条件が true になるまでポーリングで待つ。timeoutMs を超えたら false 返す */
    async function waitFor(predicate: () => boolean, timeoutMs: number): Promise<boolean> {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        if (predicate()) return true;
        await new Promise((r) => setTimeout(r, 50));
      }
      return false;
    }

    const mediaCommandHandlers = createMediaCommandHandlers(RES_TAG, {
      findElement: findEl,
      buildDataTransfer,
      mediaPreviewScope,
      countMediaPreviews,
      mediaAcceptedPredicate,
      mediaRejectionMessage,
      waitForUploadComplete,
      onMediaDispatched: (id) => {
        window.postMessage({
          source: RES_TAG,
          id,
          ok: true,
          phase: 'media-dispatched',
        } satisfies InjectResponse, '*');
      },
    });
    const requestHandlers: InjectRequestHandlerMap<InjectRequest, InjectResponse> = {
      input: mediaCommandHandlers.input,
      drop: mediaCommandHandlers.drop,
      text: injectText,
      'tumblr-text': (request) => handleTumblrTextCommand(request, RES_TAG),
      'tag-list': (request) => handleTagListCommand(request, RES_TAG),
      click: (request) => handleClickCommand(request, RES_TAG),
      'x-post-url': readLatestXPostUrl,
    };

    async function handle(req: InjectRequest): Promise<InjectResponse> {
      try {
        installUploadHook();
        return await dispatchInjectRequest(req, requestHandlers);
      } catch (e) {
        return {
          source: RES_TAG,
          id: req.id,
          ok: false,
          error: e instanceof Error ? e.message : String(e),
        };
      }
    }

    // 起動直後に hook をインストール(早ければ早いほど取りこぼしが少ない)
    installUploadHook();
    installPostCaptureObserver();

    window.addEventListener('message', (ev) => {
      if (ev.source !== window) return;
      const data = ev.data as Partial<InjectRequest> | undefined;
      if (!data || data.source !== REQ_TAG || typeof data.id !== 'string') return;
      if (typeof data.selector !== 'string' || !Array.isArray(data.files)) return;
      const req: InjectRequest = {
        source: REQ_TAG,
        id: data.id,
        mode: decodeInjectRequestMode(data.mode),
        selector: data.selector,
        files: data.files,
        text: typeof data.text === 'string' ? data.text : undefined,
        minCapturedAt: typeof data.minCapturedAt === 'number' ? data.minCapturedAt : undefined,
        tags: Array.isArray(data.tags) ? data.tags.filter((t): t is string => typeof t === 'string') : undefined,
        texts: Array.isArray(data.texts) ? data.texts.filter((t): t is string => typeof t === 'string') : undefined,
        uploadTimeoutMs: typeof data.uploadTimeoutMs === 'number' ? data.uploadTimeoutMs : undefined,
        requireVideoAccepted: typeof data.requireVideoAccepted === 'boolean' ? data.requireVideoAccepted : undefined,
        requireMediaAccepted: typeof data.requireMediaAccepted === 'boolean' ? data.requireMediaAccepted : undefined,
        requireMediaPreview: typeof data.requireMediaPreview === 'boolean' ? data.requireMediaPreview : undefined,
        requireUploadComplete: typeof data.requireUploadComplete === 'boolean' ? data.requireUploadComplete : undefined,
      };
      void handle(req)
        .then((res) => {
          if (!res.ok) console.warn('[Tutti inject-helper] failed:', res.error);
          else if (res.uploadTimedOut) console.warn('[Tutti inject-helper] upload timeout');
          window.postMessage(res, '*');
        })
        .catch((err: unknown) => {
          const message = err instanceof Error ? err.message : String(err);
          console.warn('[Tutti inject-helper] unhandled request error:', message);
          window.postMessage({
            source: RES_TAG,
            id: req.id,
            ok: false,
            error: `inject-helper exception: ${message}`,
          } satisfies InjectResponse, '*');
        });
    });
  },
});
