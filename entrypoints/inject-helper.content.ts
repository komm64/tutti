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

import { validateTumblrBodyText } from '../src/utils/tumblr-text';
import {
  extractInstagramPostRecord,
  extractTumblrPostRecord,
  isInstagramConfigureUrl,
  prepareInstagramConfigureBody,
} from '../src/utils/post-capture-record';

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
  mode: 'input' | 'drop' | 'text' | 'tumblr-text' | 'tag-list' | 'click' | 'x-post-url';
  selector: string;
  files: InjectFileSpec[];
  /** mode === 'text' 専用: 挿入するテキスト */
  text?: string;
  /** mode === 'tag-list' 専用: 順次 commit する tag 列 */
  tags?: string[];
  /** mode === 'click' 専用: 候補が複数ある場合に許可する完全一致テキスト */
  texts?: string[];
  /** アップロード完了待ちのタイムアウト(ms)。省略時 30000 */
  uploadTimeoutMs?: number;
  /** video file で upload/preview evidence を必須にするか。省略時 true */
  requireVideoAccepted?: boolean;
}

interface InjectResponse {
  source: typeof RES_TAG;
  id: string;
  ok: boolean;
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
    __tuttiTumblrLatestPost?: { url?: string; id?: string; blogName?: string; capturedAt: number; textHash?: string };
    __tuttiXPostCaptureInstalled?: boolean;
    __tuttiXLatestPostId?: { id: string; capturedAt: number };
  }
}

export default defineContentScript({
  matches: SNS_HOSTS,
  world: 'MAIN',
  runAt: 'document_idle',
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

    function installIgCaptionFetchHook() {
      if (!/instagram\.com/.test(location.host)) return;
      // 多重 install 防止
      if ((window as unknown as { __tuttiIgFetchHook?: boolean }).__tuttiIgFetchHook) return;
      (window as unknown as { __tuttiIgFetchHook?: boolean }).__tuttiIgFetchHook = true;

      const captureInstagramPost = (payload: unknown, textHash?: string): void => {
        const record = extractInstagramPostRecord(payload, textHash);
        if (!record?.url) return;
        window.__tuttiIgLatestPost = record;
        try {
          localStorage.setItem('tutti:ig-latest-post', JSON.stringify(record));
        } catch { /* in-memory capture remains available */ }
        window.__tuttiIgPendingCaption = undefined;
        console.log('[Tutti inject-helper] IG post URL captured: ' + record.url);
      };

      const prepareCaptionBody = (body: string): { body: string; textHash?: string } => {
        const cap = window.__tuttiIgPendingCaption;
        const prepared = prepareInstagramConfigureBody(body, cap);
        if (prepared.changed) {
          console.log('[Tutti inject-helper] IG configure: caption を inject (len=' + (cap?.length ?? 0) + ')');
        }
        return { body: prepared.body, textHash: prepared.textHash };
      };

      // fetch hook
      const origFetch = window.fetch.bind(window);
      window.fetch = async function(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
        let requestTextHash: string | undefined;
        let nextInit = init;
        try {
          const url = typeof input === 'string' ? input : (input instanceof URL ? input.toString() : input.url);
          if (url && isInstagramConfigureUrl(url) && typeof init?.body === 'string') {
            const prepared = prepareCaptionBody(init.body);
            requestTextHash = prepared.textHash;
            if (prepared.body !== init.body) nextInit = { ...init, body: prepared.body };
          }
        } catch (e) {
          console.warn('[Tutti inject-helper] IG fetch hook err:', e);
        }
        const response = await origFetch(input as RequestInfo, nextInit);
        try {
          const url = typeof input === 'string' ? input : (input instanceof URL ? input.toString() : input.url);
          if (url && isInstagramConfigureUrl(url)) {
            void response.clone().json().then((data) => captureInstagramPost(data, requestTextHash)).catch(() => {});
          }
        } catch { /* capture is best-effort */ }
        return response;
      };

      // XHR hook (IG は configure/ を XHR 経由で呼んでる可能性、 fetch hook が
      // intercept しない事故を防ぐ)
      const OrigXHR = window.XMLHttpRequest;
      const origOpen = OrigXHR.prototype.open;
      const origSend = OrigXHR.prototype.send;
      // url を per-instance に持たせるための WeakMap
      const urls = new WeakMap<XMLHttpRequest, string>();
      OrigXHR.prototype.open = function(this: XMLHttpRequest, method: string, url: string | URL, ...rest: unknown[]) {
        const u = typeof url === 'string' ? url : url.toString();
        urls.set(this, u);
        // @ts-expect-error rest spread
        return origOpen.call(this, method, u, ...rest);
      };
      OrigXHR.prototype.send = function(this: XMLHttpRequest, body?: Document | XMLHttpRequestBodyInit | null) {
        let requestTextHash: string | undefined;
        try {
          const url = urls.get(this) ?? '';
          if (isInstagramConfigureUrl(url) && typeof body === 'string') {
            const prepared = prepareCaptionBody(body);
            requestTextHash = prepared.textHash;
            if (prepared.body !== body) body = prepared.body;
            this.addEventListener('load', () => {
              try { captureInstagramPost(JSON.parse(this.responseText), requestTextHash); } catch { /* best-effort */ }
            }, { once: true });
          }
        } catch (e) {
          console.warn('[Tutti inject-helper] IG XHR hook err:', e);
        }
        return origSend.call(this, body as Document | XMLHttpRequestBodyInit | null);
      };
      console.log('[Tutti inject-helper] IG fetch + XHR hooks installed');
    }

    function installTumblrPostCaptureHook() {
      if (!/tumblr\.com/.test(location.host)) return;
      if ((window as unknown as { __tuttiTumblrPostCaptureHook?: boolean }).__tuttiTumblrPostCaptureHook) return;
      (window as unknown as { __tuttiTumblrPostCaptureHook?: boolean }).__tuttiTumblrPostCaptureHook = true;

      const isTumblrPostCreateUrl = (url: string, method = 'GET'): boolean =>
        method.toUpperCase() === 'POST' && (
          /\/api\/v2\/blog\/[^/]+\/post(?:\?|$|\/)/.test(url) ||
          /\/v2\/blog\/[^/]+\/post(?:\?|$|\/)/.test(url)
        );

      const blogNameFromUrl = (url: string): string | undefined => {
        const m = url.match(/\/(?:api\/)?v2\/blog\/([^/]+)\/post/);
        return m?.[1]?.replace(/\.tumblr\.com$/i, '');
      };

      const captureTumblrPost = (payload: unknown, blogName?: string): void => {
        let textHash: string | undefined;
        try {
          textHash = localStorage.getItem('tutti:tumblr-pending-text-hash') ?? undefined;
        } catch { /* ignore storage failures */ }
        const record = extractTumblrPostRecord(payload, blogName, textHash);
        if (!record?.url) return;
        window.__tuttiTumblrLatestPost = record;
        try {
          localStorage.setItem('tutti:tumblr-latest-post', JSON.stringify(record));
          localStorage.removeItem('tutti:tumblr-pending-text-hash');
        } catch { /* in-memory capture remains available */ }
        console.log('[Tutti inject-helper] Tumblr post URL captured: ' + record.url);
      };

      const origFetch = window.fetch.bind(window);
      window.fetch = async function(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
        const url = typeof input === 'string' ? input : (input instanceof URL ? input.toString() : input.url);
        const method = init?.method ?? (input instanceof Request ? input.method : 'GET');
        const shouldCapture = isTumblrPostCreateUrl(url, method);
        const response = await origFetch(input as RequestInfo, init);
        if (shouldCapture) {
          void response.clone().json().then((data) => captureTumblrPost(data, blogNameFromUrl(url))).catch(() => {});
        }
        return response;
      };

      const OrigXHR = window.XMLHttpRequest;
      const origOpen = OrigXHR.prototype.open;
      const requests = new WeakMap<XMLHttpRequest, { method: string; url: string }>();
      OrigXHR.prototype.open = function(this: XMLHttpRequest, method: string, url: string | URL, ...rest: unknown[]) {
        const value = typeof url === 'string' ? url : url.toString();
        requests.set(this, { method, url: value });
        // @ts-expect-error rest spread
        return origOpen.call(this, method, value, ...rest);
      };
      const origSend = OrigXHR.prototype.send;
      OrigXHR.prototype.send = function(this: XMLHttpRequest, body?: Document | XMLHttpRequestBodyInit | null) {
        const req = requests.get(this);
        const url = req?.url ?? '';
        if (isTumblrPostCreateUrl(url, req?.method)) {
          this.addEventListener('load', () => {
            try { captureTumblrPost(JSON.parse(this.responseText), blogNameFromUrl(url)); } catch { /* best-effort */ }
          }, { once: true });
        }
        return origSend.call(this, body as Document | XMLHttpRequestBodyInit | null);
      };
    }

    function installUploadHook() {
      if (window.__tuttiUploadHookInstalled) return;
      window.__tuttiUploadHookInstalled = true;
      window.__tuttiUpload = { successCount: 0, lastSuccessAt: 0 };
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

    function installXPostCaptureHook() {
      if (!/^(?:x|twitter)\.com$/.test(location.host) || window.__tuttiXPostCaptureInstalled) return;
      window.__tuttiXPostCaptureInstalled = true;
      const captureRestId = (body: unknown): void => {
        const findRestId = (value: unknown, depth = 0): string | undefined => {
          if (!value || typeof value !== 'object' || depth > 12) return undefined;
          const obj = value as Record<string, unknown>;
          if (typeof obj.rest_id === 'string' && /^\d+$/.test(obj.rest_id)) return obj.rest_id;
          for (const child of Object.values(obj)) {
            const found = findRestId(child, depth + 1);
            if (found) return found;
          }
          return undefined;
        };
        const id = findRestId(body);
        if (!id) return;
        const captured = { id, capturedAt: Date.now() };
        window.__tuttiXLatestPostId = captured;
        try {
          localStorage.setItem('tutti:x-latest-post', JSON.stringify(captured));
        } catch { /* in-memory capture remains available */ }
      };
      const origFetch = window.fetch.bind(window);
      window.fetch = async function(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
        const response = await origFetch(input as RequestInfo, init);
        try {
          const url = typeof input === 'string' ? input : (input instanceof URL ? input.toString() : input.url);
          if (/\/CreateTweet\b/i.test(url)) {
            void response.clone().json().then(captureRestId).catch(() => {});
          }
        } catch { /* capture is best-effort */ }
        return response;
      };
      const OrigXHR = window.XMLHttpRequest;
      const origOpen = OrigXHR.prototype.open;
      const urls = new WeakMap<XMLHttpRequest, string>();
      OrigXHR.prototype.open = function(this: XMLHttpRequest, method: string, url: string | URL, ...rest: unknown[]) {
        const value = typeof url === 'string' ? url : url.toString();
        urls.set(this, value);
        // @ts-expect-error rest spread
        return origOpen.call(this, method, value, ...rest);
      };
      const origSend = OrigXHR.prototype.send;
      OrigXHR.prototype.send = function(this: XMLHttpRequest, body?: Document | XMLHttpRequestBodyInit | null) {
        if (/\/CreateTweet\b/i.test(urls.get(this) ?? '')) {
          this.addEventListener('load', () => {
            try { captureRestId(JSON.parse(this.responseText)); } catch { /* best-effort */ }
          }, { once: true });
        }
        return origSend.call(this, body as Document | XMLHttpRequestBodyInit | null);
      };
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
        isMediaPreviewVisible?: () => boolean;
      } = {},
    ): Promise<{ uploadCount: number; timedOut: boolean; acceptedByPreview: boolean }> {
      const tracker = window.__tuttiUpload!;
      const startCount = tracker.successCount;
      const start = Date.now();
      const deadline = start + timeoutMs;
      const QUIET_MS = 800;
      // Bluesky のように attach 時にアップロードしない SNS のために 4s で諦める
      // (アップロードする SNS は ~500ms 以内に最初のリクエストが飛ぶので十分)
      const NO_UPLOAD_GIVE_UP_MS = 4000;

      while (Date.now() < deadline) {
        const newSuccess = tracker.successCount - startCount;
        const elapsed = Date.now() - start;
        const acceptedByPreview = !!options.isMediaPreviewVisible?.();

        if (newSuccess > 0) {
          const sinceLast = Date.now() - tracker.lastSuccessAt;
          if (sinceLast >= QUIET_MS) {
            return { uploadCount: newSuccess, timedOut: false, acceptedByPreview };
          }
        } else if (acceptedByPreview && options.requireMediaAccepted) {
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

    function mediaPreviewScope(target: HTMLElement): ParentNode {
      return target.closest('[role="dialog"], [data-testid="composer"], form, main') ?? document.body;
    }

    function countMediaPreviews(scope: ParentNode): number {
      const selectors = [
        'video',
        'canvas',
        'img[src^="blob:"]',
        'img[src^="data:"]',
        'img[src*="twimg.com/media"]',
        '[data-testid*="media" i]',
        '[data-testid*="attachment" i]',
        '[aria-label*="Remove" i]',
        '[aria-label*="削除"]',
      ].join(',');
      return Array
        .from(scope.querySelectorAll<HTMLElement>(selectors))
        .filter(isVisibleMediaElement)
        .length;
    }

    function mediaAcceptedPredicate(target: HTMLElement, beforeCount: number): () => boolean {
      return () => {
        const scope = target.isConnected ? mediaPreviewScope(target) : document.body;
        return countMediaPreviews(scope) > beforeCount;
      };
    }

    function findEl(selector: string): { el: HTMLElement; matchedPart: string } | null {
      for (const part of selector.split(',').map((s) => s.trim()).filter(Boolean)) {
        const el = document.querySelector<HTMLElement>(part);
        if (el) return { el, matchedPart: part };
      }
      return null;
    }

    function findAllBySelector(selector: string): HTMLElement[] {
      const seen = new Set<HTMLElement>();
      const matches: HTMLElement[] = [];
      for (const part of selector.split(',').map((s) => s.trim()).filter(Boolean)) {
        for (const el of document.querySelectorAll<HTMLElement>(part)) {
          if (seen.has(el)) continue;
          seen.add(el);
          matches.push(el);
        }
      }
      return matches;
    }

    function isTumblrBodyBlock(el: HTMLElement): boolean {
      return el.tagName !== 'H1' &&
        el.getAttribute('contenteditable') === 'true' &&
        !el.closest('[aria-label*="tag" i]');
    }

    function tumblrBodyBlocks(selector: string, fallback: HTMLElement): HTMLElement[] {
      const scope = fallback.closest('[data-testid="gutenberg-editor"]') ??
        fallback.closest('[role="dialog"]') ??
        document;
      const scoped = Array
        .from(scope.querySelectorAll<HTMLElement>(
          '[data-testid="gutenberg-editor"] p[contenteditable="true"], p.block-editor-rich-text__editable[role="document"][contenteditable="true"], p[contenteditable="true"]',
        ))
        .filter(isTumblrBodyBlock);
      return scoped.length > 0 ? scoped : findAllBySelector(selector).filter(isTumblrBodyBlock);
    }

    function readTumblrBodyText(blocks: readonly HTMLElement[]): string {
      return blocks
        .map((block) => (block.innerText ?? block.textContent ?? '').trim())
        .filter(Boolean)
        .join('\n');
    }

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

    async function injectIntoInput(req: InjectRequest): Promise<InjectResponse> {
      const found = findEl(req.selector);
      if (!found) {
        return { source: RES_TAG, id: req.id, ok: false, error: 'file input not found' };
      }
      const input = found.el as HTMLInputElement;
      const inDialog = !!input.closest('[role="dialog"]');
      console.log(`[Tutti inject-helper] inject input matched "${found.matchedPart}" — inDialog=${inDialog}`);
      const built = buildDataTransfer(req.files);
      if ('error' in built) return { source: RES_TAG, id: req.id, ok: false, error: built.error };
      const requireMediaAccepted =
        req.requireVideoAccepted !== false &&
        req.files.some((file) => file.type.startsWith('video/'));
      const beforePreviewCount = countMediaPreviews(mediaPreviewScope(input));
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'files')?.set;
      if (setter) setter.call(input, built.dt.files);
      else input.files = built.dt.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
      input.dispatchEvent(new Event('input', { bubbles: true }));
      const wait = await waitForUploadComplete(req.uploadTimeoutMs ?? 30000, {
        requireMediaAccepted,
        isMediaPreviewVisible: requireMediaAccepted
          ? mediaAcceptedPredicate(input, beforePreviewCount)
          : undefined,
      });
      const ok = !wait.timedOut || wait.acceptedByPreview;
      return {
        source: RES_TAG,
        id: req.id,
        ok,
        error: ok ? undefined : 'Timed out while waiting for the video upload or media preview',
        fileCount: input.files?.length ?? 0,
        uploadCount: wait.uploadCount,
        acceptedByPreview: wait.acceptedByPreview,
        uploadTimedOut: wait.timedOut,
      };
    }

    async function injectText(req: InjectRequest): Promise<InjectResponse> {
      const found = findEl(req.selector);
      if (!found) {
        return { source: RES_TAG, id: req.id, ok: false, error: 'text target not found' };
      }
      const el = found.el;
      const text = req.text ?? '';
      console.log(`[Tutti inject-helper] text target matched "${found.matchedPart}" (${el.tagName})`);

      // v0.4.59: 空文字 inject は no-op で成功扱い (画像のみ投稿の正常 path)。
      // 旧コードは空文字でも paste → polling → ok 判定 (visible.length > 0) で
      // false 返してエラーになり、画像のみ投稿 (本文なし) が X / Tumblr / IG で
      // 失敗していた (user 報告 2026-05-16)。
      if (text === '') {
        return { source: RES_TAG, id: req.id, ok: true };
      }

      el.focus();

      if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
        // textarea / input: native value setter + input event
        const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
        if (setter) setter.call(el, text);
        else (el as HTMLTextAreaElement).value = text;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
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
        const isLexical =
          !!el.closest('[data-lexical-editor]') ||
          el.matches('[data-lexical-editor]');

        if (isLexical) {
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
          let editor: any = null; // eslint-disable-line @typescript-eslint/no-explicit-any
          let cur: HTMLElement | null = el;
          while (cur) {
            if ((cur as any).__lexicalEditor) { // eslint-disable-line @typescript-eslint/no-explicit-any
              editor = (cur as any).__lexicalEditor; // eslint-disable-line @typescript-eslint/no-explicit-any
              break;
            }
            cur = cur.parentElement;
          }

          const shouldUseDirectLexicalState = /instagram\.com/.test(location.host);
          if (shouldUseDirectLexicalState && editor && typeof editor.parseEditorState === 'function' && typeof editor.setEditorState === 'function') {
            try {
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
              const newState = editor.parseEditorState(JSON.stringify(stateJson));
              editor.setEditorState(newState);
              console.log('[Tutti inject-helper] setEditorState completed; text =', text.slice(0, 50));
              // React の update tick を待つ
              await new Promise((r) => setTimeout(r, 500));
              // verify state has text via editor.getEditorState
              try {
                const stateNow = editor.getEditorState();
                const txt = stateNow.read(() => {
                  const root = stateNow.toJSON();
                  return JSON.stringify(root).slice(0, 200);
                });
                console.log('[Tutti inject-helper] Lexical state after setEditorState:', txt);
              } catch (e) {
                console.log('[Tutti inject-helper] state read err:', e);
              }
              // setEditorState が onChange を起こすが、 補助的に input event も
              // dispatch して IG の controlled input listener にも届くようにする
              el.dispatchEvent(new InputEvent('input', {
                bubbles: true, data: text, inputType: 'insertText',
              }));
              await new Promise((r) => setTimeout(r, 300));
            } catch (e) {
              console.warn('[Tutti inject-helper] Lexical setEditorState failed, falling back to events:', e);
              editor = null; // event-based fallback に流す
            }
          } else {
            editor = null; // X 等は framework event path の方が composer state と同期しやすい
          }

          if (!editor) {
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
            try {
              document.execCommand('selectAll', false);
              document.execCommand('delete', false);
            } catch { /* ignore */ }
            const beforeEv = new InputEvent('beforeinput', {
              bubbles: true, cancelable: true, inputType: 'insertText', data: text,
            });
            el.dispatchEvent(beforeEv);
            if (!beforeEv.defaultPrevented) {
              try { document.execCommand('insertText', false, text); } catch { /* ignore */ }
            }
            el.dispatchEvent(new InputEvent('input', {
              bubbles: true, data: text, inputType: 'insertText',
            }));
            await new Promise((r) => setTimeout(r, 800));
          }
        } else if (
          el.matches('.public-DraftEditor-content') ||
          !!el.closest('.DraftEditor-root')
        ) {
          // Draft.js (TikTok Studio): upload 後に filename 由来の初期 caption
          // が入る variant がある。DOM だけ消して paste すると controlled
          // state 側の旧値へ追記されるため、editor selection を全置換する。
          const sel = window.getSelection();
          el.focus();
          if (sel) {
            sel.removeAllRanges();
            const range = document.createRange();
            range.selectNodeContents(el);
            sel.addRange(range);
          }
          try {
            document.execCommand('delete', false);
          } catch { /* fallback below verifies the DOM */ }
          const dt = new DataTransfer();
          dt.setData('text/plain', text);
          el.dispatchEvent(new ClipboardEvent('paste', {
            bubbles: true,
            cancelable: true,
            clipboardData: dt,
          }));
          const matchSnippet = text.slice(0, Math.min(16, text.length));
          const visibleNow = (): string =>
            (el as HTMLElement).innerText ?? el.textContent ?? '';
          const pasted = await waitFor(
            () => matchSnippet === '' || visibleNow().includes(matchSnippet),
            600,
          );
          if (!pasted) {
            try {
              document.execCommand('insertText', false, text);
            } catch { /* fallback below verifies the DOM */ }
          }
          el.dispatchEvent(new InputEvent('input', {
            bubbles: true, data: text, inputType: 'insertText',
          }));
          el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: text.slice(-1) || 'a' }));
          await new Promise((r) => setTimeout(r, 800));
        } else {
          // 非 Lexical (TipTap / ProseMirror 等): paste event 経由
          const existing = (el.textContent ?? '').trim();
          if (existing.length > 0) {
            const sel = window.getSelection();
            if (sel) {
              sel.selectAllChildren(el);
              sel.deleteFromDocument();
            }
            if ((el.textContent ?? '').trim().length > 0) {
              try {
                document.execCommand('selectAll', false);
                document.execCommand('delete', false);
              } catch { /* ignore */ }
            }
          }
          const dt = new DataTransfer();
          dt.setData('text/plain', text);
          const pasteEv = new ClipboardEvent('paste', {
            bubbles: true,
            cancelable: true,
            clipboardData: dt,
          });
          el.dispatchEvent(pasteEv);

          const matchSnippet = text.slice(0, Math.min(16, text.length));
          const visibleNow = (): string =>
            (el as HTMLElement).innerText ?? el.textContent ?? '';
          const pasted = await waitFor(
            () => matchSnippet === '' || visibleNow().includes(matchSnippet),
            600,
          );

          if (!pasted) {
            el.textContent = text;
            el.dispatchEvent(new InputEvent('input', {
              bubbles: true, data: text, inputType: 'insertText',
            }));
            await new Promise((r) => setTimeout(r, 80));
          }
        }
      }

      // 検証(DOM ベース)。React state まで反映されたかは別途送信側 SNS の post button が
      // enable になるかで判定するため、ここでは DOM レベルの確認のみ。
      // input/textarea は value で厳密に判定。contenteditable は innerText が
      // 取れない / Lexical 等が DOM を再構成するので、内容が「空でないこと」だけ
      // 緩く判定する (paste / execCommand / textContent 代入のいずれかが効いたか)。
      let ok: boolean;
      if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
        ok = el.value.includes(text.slice(0, Math.min(20, text.length)));
      } else {
        // innerText を優先 (Lexical 等が span ネストする場合に textContent より確実)
        const visible = (el.innerText ?? el.textContent ?? '').trim();
        const expectedSnippet = text.slice(0, Math.min(20, text.length)).trim();
        ok = expectedSnippet === '' ||
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

    async function clearEditableBlock(el: HTMLElement): Promise<void> {
      el.focus();
      const sel = window.getSelection();
      if (sel) {
        try {
          sel.removeAllRanges();
          const range = document.createRange();
          range.selectNodeContents(el);
          sel.addRange(range);
        } catch { /* ignore */ }
      }
      try {
        document.execCommand('delete', false);
      } catch { /* fallback below */ }
      if ((el.textContent ?? '').trim().length > 0) {
        el.textContent = '';
        el.dispatchEvent(new InputEvent('input', {
          bubbles: true,
          inputType: 'deleteContentBackward',
        }));
      }
      await new Promise((r) => setTimeout(r, 50));
    }

    async function injectTumblrText(req: InjectRequest): Promise<InjectResponse> {
      const found = findEl(req.selector);
      if (!found) {
        return { source: RES_TAG, id: req.id, ok: false, error: 'Tumblr text target not found' };
      }
      const text = req.text ?? '';
      const blocks = tumblrBodyBlocks(req.selector, found.el);
      const target = blocks[0] ?? found.el;
      console.log(`[Tutti inject-helper] Tumblr text target matched "${found.matchedPart}" (${blocks.length} body blocks)`);

      for (const block of blocks) {
        await clearEditableBlock(block);
      }
      target.focus();

      if (text) {
        const dt = new DataTransfer();
        dt.setData('text/plain', text);
        target.dispatchEvent(new ClipboardEvent('paste', {
          bubbles: true,
          cancelable: true,
          clipboardData: dt,
        }));
        const expectedSnippet = text.slice(0, Math.min(20, text.length)).trim();
        const pasted = await waitFor(
          () => readTumblrBodyText(tumblrBodyBlocks(req.selector, target)).includes(expectedSnippet),
          700,
        );
        if (!pasted) {
          target.textContent = text;
          target.dispatchEvent(new InputEvent('input', {
            bubbles: true,
            data: text,
            inputType: 'insertText',
          }));
          await new Promise((r) => setTimeout(r, 100));
        }
      }

      const afterBlocks = tumblrBodyBlocks(req.selector, target);
      const bodyText = readTumblrBodyText(afterBlocks);
      const validation = validateTumblrBodyText(bodyText, text);
      return {
        source: RES_TAG,
        id: req.id,
        ok: validation.ok,
        error: validation.error,
      };
    }

    async function injectViaDrop(req: InjectRequest): Promise<InjectResponse> {
      const found = findEl(req.selector);
      if (!found) {
        return { source: RES_TAG, id: req.id, ok: false, error: 'drop target not found' };
      }
      const target = found.el;
      console.log(`[Tutti inject-helper] drop target matched "${found.matchedPart}"`);
      const built = buildDataTransfer(req.files);
      if ('error' in built) return { source: RES_TAG, id: req.id, ok: false, error: built.error };
      const requireMediaAccepted = req.files.some((file) => file.type.startsWith('video/'));
      const beforePreviewCount = countMediaPreviews(mediaPreviewScope(target));
      const rect = target.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      for (const type of ['dragenter', 'dragover', 'drop'] as const) {
        const ev = new DragEvent(type, {
          bubbles: true,
          cancelable: true,
          dataTransfer: built.dt,
          clientX: x,
          clientY: y,
        });
        target.dispatchEvent(ev);
      }
      const wait = await waitForUploadComplete(req.uploadTimeoutMs ?? 30000, {
        requireMediaAccepted,
        isMediaPreviewVisible: requireMediaAccepted
          ? mediaAcceptedPredicate(target, beforePreviewCount)
          : undefined,
      });
      const ok = !wait.timedOut || wait.acceptedByPreview;
      return {
        source: RES_TAG,
        id: req.id,
        ok,
        error: ok ? undefined : 'Timed out while waiting for the video upload or media preview',
        fileCount: built.dt.files.length,
        droppedOn: target.tagName,
        uploadCount: wait.uploadCount,
        acceptedByPreview: wait.acceptedByPreview,
        uploadTimedOut: wait.timedOut,
      };
    }

    async function injectTagList(req: InjectRequest): Promise<InjectResponse> {
      const found = findEl(req.selector);
      if (!found) {
        return {
          source: RES_TAG,
          id: req.id,
          ok: false,
          error: `tag input not found: ${req.selector}`,
        };
      }
      const input = found.el as HTMLInputElement | HTMLTextAreaElement;
      // v0.4.73: textarea も許容 (Tumblr の "Tags editor" は textarea)。
      const isTextarea = input instanceof HTMLTextAreaElement;
      if (!(input instanceof HTMLInputElement) && !isTextarea) {
        return {
          source: RES_TAG,
          id: req.id,
          ok: false,
          error: 'tag-list mode only supports <input> and <textarea> elements',
        };
      }
      const tags = req.tags ?? [];
      console.log(`[Tutti inject-helper] tag-list: ${tags.length} tags into "${found.matchedPart}" (${isTextarea ? 'textarea' : 'input'})`);
      const setter = isTextarea
        ? Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
        : Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;

      // React は controlled input/textarea に対して内部で _valueTracker を持つ。
      function setReactValue(el: HTMLInputElement | HTMLTextAreaElement, value: string): void {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const tracker = (el as any)._valueTracker as { setValue: (v: string) => void } | undefined;
        if (tracker) tracker.setValue('');
        if (setter) setter.call(el, value);
        else el.value = value;
      }
      // 旧名 alias (function 内で使ってる古い名前のため)
      const setReactInputValue = setReactValue;

      let committed = 0;
      for (const tag of tags) {
        input.focus();
        setReactInputValue(input, tag);
        // input + change を両方発火。React は input イベントを listener として
        // 登録するが、formik / react-hook-form 等は change を見ることもある
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        await new Promise((r) => setTimeout(r, 150));
        // Enter で commit。React 系は keydown を見るので 3 種 dispatch
        const opts = { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true };
        input.dispatchEvent(new KeyboardEvent('keydown', opts));
        input.dispatchEvent(new KeyboardEvent('keypress', opts));
        input.dispatchEvent(new KeyboardEvent('keyup', opts));
        // Enter 後 input が空に戻れば commit 成功 (chip 化された証拠)。最大 1.5s 待つ
        const cleared = await waitFor(() => input.value === '', 1500);
        if (cleared) {
          committed++;
          console.log(`[Tutti inject-helper] tag committed: "${tag}"`);
        } else {
          console.warn(`[Tutti inject-helper] tag NOT committed (input not cleared): "${tag}" current="${input.value}"`);
          // Enter が効いてない場合のフォールバック: keydown だけ再試行
          input.dispatchEvent(new KeyboardEvent('keydown', opts));
          await new Promise((r) => setTimeout(r, 400));
          if (input.value === '') {
            committed++;
            console.log(`[Tutti inject-helper] tag committed on retry: "${tag}"`);
          }
        }
      }
      return {
        source: RES_TAG,
        id: req.id,
        ok: committed > 0,
        error: committed === 0 ? `no tags committed (tried ${tags.length})` : undefined,
      };
    }

    async function clickElement(req: InjectRequest): Promise<InjectResponse> {
      const texts = req.texts ?? [];
      for (const part of req.selector.split(',').map((s) => s.trim()).filter(Boolean)) {
        for (const el of document.querySelectorAll<HTMLElement>(part)) {
          if (texts.length > 0 && !texts.includes((el.textContent ?? '').trim())) continue;
          if (el.getAttribute('aria-disabled') === 'true' || (el as HTMLButtonElement).disabled) continue;
          console.log(`[Tutti inject-helper] click target matched "${part}"`);
          if (
            /^(x|twitter)\.com$/.test(location.hostname) &&
            (el.getAttribute('data-testid') === 'addButton' || /add post/i.test(el.getAttribute('aria-label') ?? ''))
          ) {
            el.focus();
            const init = {
              bubbles: true,
              cancelable: true,
              composed: true,
              key: 'Enter',
              code: 'Enter',
            };
            el.dispatchEvent(new KeyboardEvent('keydown', init));
            el.dispatchEvent(new KeyboardEvent('keypress', init));
            el.dispatchEvent(new KeyboardEvent('keyup', init));
            return { source: RES_TAG, id: req.id, ok: true };
          }
          el.click();
          return { source: RES_TAG, id: req.id, ok: true };
        }
      }
      return { source: RES_TAG, id: req.id, ok: false, error: 'click target not found' };
    }

    async function readLatestXPostUrl(req: InjectRequest): Promise<InjectResponse> {
      let captured = window.__tuttiXLatestPostId;
      try {
        captured ??= JSON.parse(localStorage.getItem('tutti:x-latest-post') ?? 'null') as typeof captured;
      } catch { /* ignore malformed or unavailable storage */ }
      const handle = req.text?.replace(/^@/, '');
      const fresh = captured && Date.now() - captured.capturedAt < 60_000;
      return {
        source: RES_TAG,
        id: req.id,
        ok: true,
        url: fresh && handle && captured ? `https://x.com/${handle}/status/${captured.id}` : undefined,
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

    async function handle(req: InjectRequest): Promise<InjectResponse> {
      try {
        installUploadHook();
        installTumblrPostCaptureHook();
        installXPostCaptureHook();
        if (req.mode === 'text') return await injectText(req);
        if (req.mode === 'tumblr-text') return await injectTumblrText(req);
        if (req.mode === 'drop') return await injectViaDrop(req);
        if (req.mode === 'tag-list') return await injectTagList(req);
        if (req.mode === 'click') return await clickElement(req);
        if (req.mode === 'x-post-url') return await readLatestXPostUrl(req);
        return await injectIntoInput(req);
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
    installIgCaptionFetchHook();
    installTumblrPostCaptureHook();
    installXPostCaptureHook();

    window.addEventListener('message', (ev) => {
      if (ev.source !== window) return;
      const data = ev.data as Partial<InjectRequest> | undefined;
      if (!data || data.source !== REQ_TAG || typeof data.id !== 'string') return;
      if (typeof data.selector !== 'string' || !Array.isArray(data.files)) return;
      const mode: InjectRequest['mode'] =
        data.mode === 'drop' ? 'drop' :
        data.mode === 'text' ? 'text' :
        data.mode === 'tumblr-text' ? 'tumblr-text' :
        data.mode === 'tag-list' ? 'tag-list' :
        data.mode === 'click' ? 'click' :
        data.mode === 'x-post-url' ? 'x-post-url' : 'input';
      const req: InjectRequest = {
        source: REQ_TAG,
        id: data.id,
        mode,
        selector: data.selector,
        files: data.files,
        text: typeof data.text === 'string' ? data.text : undefined,
        tags: Array.isArray(data.tags) ? data.tags.filter((t): t is string => typeof t === 'string') : undefined,
        texts: Array.isArray(data.texts) ? data.texts.filter((t): t is string => typeof t === 'string') : undefined,
        uploadTimeoutMs: typeof data.uploadTimeoutMs === 'number' ? data.uploadTimeoutMs : undefined,
        requireVideoAccepted: typeof data.requireVideoAccepted === 'boolean' ? data.requireVideoAccepted : undefined,
      };
      void handle(req).then((res) => {
        if (!res.ok) console.warn('[Tutti inject-helper] failed:', res.error);
        else if (res.uploadTimedOut) console.warn('[Tutti inject-helper] upload timeout');
        window.postMessage(res, '*');
      });
    });
  },
});
