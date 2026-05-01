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
   */
  mode: 'input' | 'drop' | 'text';
  selector: string;
  files: InjectFileSpec[];
  /** mode === 'text' 専用: 挿入するテキスト */
  text?: string;
  /** アップロード完了待ちのタイムアウト(ms)。省略時 30000 */
  uploadTimeoutMs?: number;
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
  /** アップロード待機がタイムアウトしたか */
  uploadTimedOut?: boolean;
}

interface UploadTracker {
  successCount: number;
  lastSuccessAt: number;
}

declare global {
  interface Window {
    __tuttiUploadHookInstalled?: boolean;
    __tuttiUpload?: UploadTracker;
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

    function sleep(ms: number): Promise<void> {
      return new Promise((r) => setTimeout(r, ms));
    }

    /**
     * SNS のサーバアップロードが完了するまで待つ。
     * 戦略(PerformanceObserver で completion 時刻のみが分かる):
     *   - 少なくとも 1 回 upload-pattern URL で resource entry が来た +
     *     直近 800ms 以内に新規 entry なし → 完了
     *   - 6 秒待っても entry 0 件 → アップロード対象なしと判断して return
     *   - timeoutMs 超え → タイムアウト返却
     */
    async function waitForUploadComplete(timeoutMs: number): Promise<{ uploadCount: number; timedOut: boolean }> {
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

        if (newSuccess > 0) {
          const sinceLast = Date.now() - tracker.lastSuccessAt;
          if (sinceLast >= QUIET_MS) {
            return { uploadCount: newSuccess, timedOut: false };
          }
        } else if (elapsed >= NO_UPLOAD_GIVE_UP_MS) {
          return { uploadCount: 0, timedOut: false };
        }
        await sleep(150);
      }
      return { uploadCount: tracker.successCount - startCount, timedOut: true };
    }

    function findEl(selector: string): { el: HTMLElement; matchedPart: string } | null {
      for (const part of selector.split(',').map((s) => s.trim()).filter(Boolean)) {
        const el = document.querySelector<HTMLElement>(part);
        if (el) return { el, matchedPart: part };
      }
      return null;
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
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'files')?.set;
      if (setter) setter.call(input, built.dt.files);
      else input.files = built.dt.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
      input.dispatchEvent(new Event('input', { bubbles: true }));
      const wait = await waitForUploadComplete(req.uploadTimeoutMs ?? 30000);
      return {
        source: RES_TAG,
        id: req.id,
        ok: !wait.timedOut,
        error: wait.timedOut ? 'アップロード完了待ちでタイムアウトしました' : undefined,
        fileCount: input.files?.length ?? 0,
        uploadCount: wait.uploadCount,
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
        // execCommand('insertText') は X の Lexical で state 更新が来ない実績あり。
        // 最も確実なのは clipboard paste の simulation。これで Lexical/Draft の
        // onPaste ハンドラが起動し、内部 state が更新される(X 2026-04-30 検証で確認)。
        const sel = window.getSelection();
        if (sel) {
          sel.selectAllChildren(el);
          sel.deleteFromDocument();
        }
        const dt = new DataTransfer();
        dt.setData('text/plain', text);
        const pasteEv = new ClipboardEvent('paste', {
          bubbles: true,
          cancelable: true,
          clipboardData: dt,
        });
        el.dispatchEvent(pasteEv);

        // paste でダメだった場合のフォールバック: execCommand → 直接 textContent
        const matchSnippet = text.slice(0, Math.min(20, text.length));
        if (!(el.textContent ?? '').includes(matchSnippet)) {
          document.execCommand('insertText', false, text);
        }
        if (!(el.textContent ?? '').includes(matchSnippet)) {
          el.textContent = text;
          el.dispatchEvent(new InputEvent('input', { bubbles: true, data: text, inputType: 'insertText' }));
        }
      }

      // 検証(DOM ベース)。React state まで反映されたかは別途送信側 SNS の post button が
      // enable になるかで判定するため、ここでは DOM レベルの確認のみ。
      const ok = el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement
        ? el.value.includes(text.slice(0, Math.min(20, text.length)))
        : (el.textContent ?? '').includes(text.slice(0, Math.min(20, text.length)));
      return {
        source: RES_TAG,
        id: req.id,
        ok,
        error: ok ? undefined : 'text injection seems to have failed (textContent / value mismatch)',
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
      const wait = await waitForUploadComplete(req.uploadTimeoutMs ?? 30000);
      return {
        source: RES_TAG,
        id: req.id,
        ok: !wait.timedOut,
        error: wait.timedOut ? 'アップロード完了待ちでタイムアウトしました' : undefined,
        fileCount: built.dt.files.length,
        droppedOn: target.tagName,
        uploadCount: wait.uploadCount,
        uploadTimedOut: wait.timedOut,
      };
    }

    async function handle(req: InjectRequest): Promise<InjectResponse> {
      try {
        installUploadHook();
        if (req.mode === 'text') return await injectText(req);
        if (req.mode === 'drop') return await injectViaDrop(req);
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

    window.addEventListener('message', (ev) => {
      if (ev.source !== window) return;
      const data = ev.data as Partial<InjectRequest> | undefined;
      if (!data || data.source !== REQ_TAG || typeof data.id !== 'string') return;
      if (typeof data.selector !== 'string' || !Array.isArray(data.files)) return;
      const mode: InjectRequest['mode'] = data.mode === 'drop' ? 'drop' : data.mode === 'text' ? 'text' : 'input';
      const req: InjectRequest = {
        source: REQ_TAG,
        id: data.id,
        mode,
        selector: data.selector,
        files: data.files,
        text: typeof data.text === 'string' ? data.text : undefined,
        uploadTimeoutMs: typeof data.uploadTimeoutMs === 'number' ? data.uploadTimeoutMs : undefined,
      };
      void handle(req).then((res) => {
        if (!res.ok) console.warn('[Tutti inject-helper] failed:', res.error);
        else if (res.uploadTimedOut) console.warn('[Tutti inject-helper] upload timeout');
        window.postMessage(res, '*');
      });
    });
  },
});
