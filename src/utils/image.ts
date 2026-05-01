import type { ImageAttachment } from '../messages';
import { sleep, waitForElement } from './dom';

const REQ_TAG = 'tutti-inject-req-v1';
const RES_TAG = 'tutti-inject-res-v1';

interface InjectRequest {
  source: typeof REQ_TAG;
  id: string;
  mode: 'input' | 'drop' | 'text' | 'tag-list';
  selector: string;
  files: { name: string; type: string; data: string }[];
  text?: string;
  tags?: string[];
  uploadTimeoutMs?: number;
}

interface InjectResponse {
  source: typeof RES_TAG;
  id: string;
  ok: boolean;
  error?: string;
  fileCount?: number;
  droppedOn?: string;
  uploadCount?: number;
  uploadTimedOut?: boolean;
}

const RESPONSE_TIMEOUT_MS = 35000; // helper 側が最大 30s 待つので 35s で安全マージン

async function sendInjectRequest(req: Omit<InjectRequest, 'source' | 'id'>): Promise<InjectResponse> {
  const id = `tutti-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  return await new Promise<InjectResponse>((resolve, reject) => {
    const timeout = setTimeout(() => {
      window.removeEventListener('message', onMessage);
      reject(new Error('画像注入のタイムアウト(MAIN world ヘルパ未応答)'));
    }, RESPONSE_TIMEOUT_MS);

    const onMessage = (ev: MessageEvent) => {
      if (ev.source !== window) return;
      const data = ev.data as Partial<InjectResponse> | undefined;
      if (!data || data.source !== RES_TAG || data.id !== id) return;
      clearTimeout(timeout);
      window.removeEventListener('message', onMessage);
      resolve(data as InjectResponse);
    };
    window.addEventListener('message', onMessage);

    window.postMessage({ source: REQ_TAG, id, ...req }, '*');
  });
}

/**
 * MAIN world で動く inject-helper.content.ts に file input への注入を委譲する。
 *
 * Why: React/Vue/Svelte は MAIN world の HTMLInputElement.prototype を
 * monkey-patch して input 検出するので、ISOLATED world から native setter
 * を呼んでもフレームワーク側の onChange は発火しない。実機で Mastodon は
 * MAIN world 経由のみ反応することを確認(2026-04-30)。
 *
 * helper 側で fetch / XHR を hook して SNS のアップロード API 完了を待つので、
 * ここでは戻り値を信用してそのまま続行できる(固定 sleep 不要)。
 */
export async function injectImages(
  images: ImageAttachment[],
  fileInputSelector: string,
): Promise<void> {
  await waitForElement<HTMLInputElement>(fileInputSelector, 5000);

  const result = await sendInjectRequest({
    mode: 'input',
    selector: fileInputSelector,
    files: images.map((img) => ({ name: img.name, type: img.type, data: img.data })),
  });

  if (!result.ok) {
    throw new Error(result.error ?? '画像添付に失敗(SNS の UI が変わった可能性)');
  }
  console.log(`[Tutti] image upload complete (count=${result.uploadCount ?? 0})`);
  // helper が in-flight = 0 + quiet 800ms を確認した直後。少し追加で
  // SNS フロントエンドの thumbnail 描画反映を待つ
  await sleep(300);
}

/**
 * MAIN world でテキストを contenteditable / textarea に挿入する。
 *
 * ISOLATED world から `document.execCommand('insertText')` を打っても
 * X (Lexical) のように MAIN world で input listener を握っているフレームワークだと
 * state に反映されず、本文が空のまま投稿されてしまう(2026-04-30 X で実機確認)。
 * helper を MAIN world で実行して beforeinput / input をブラウザネイティブに発火させる。
 */
export async function injectTextIntoElement(
  text: string,
  selector: string,
): Promise<void> {
  await waitForElement<HTMLElement>(selector, 5000);
  const result = await sendInjectRequest({
    mode: 'text',
    selector,
    files: [],
    text,
  });
  if (!result.ok) {
    throw new Error(result.error ?? '本文の挿入に失敗(SNS の UI が変わった可能性)');
  }
}

/**
 * 「value 入力 → Enter で確定 → input clear」を繰り返す UI に tag 列を順次注入する。
 * Pixiv の tag input が代表例 (1 input に 1 tag ずつ確定する仕様)。
 * MAIN-world helper 経由で React の onChange が走るように setter + Enter key を発火。
 */
export async function injectTagList(
  tags: string[],
  inputSelector: string,
): Promise<void> {
  await waitForElement<HTMLElement>(inputSelector, 5000);
  const result = await sendInjectRequest({
    mode: 'tag-list',
    selector: inputSelector,
    files: [],
    tags,
  });
  if (!result.ok) {
    throw new Error(result.error ?? 'tag list 注入に失敗');
  }
  await sleep(200);
}

/**
 * file input が DOM に存在しない SNS (Bluesky / Misskey / Tumblr) 用に、
 * compose 領域に対して drag & drop イベントを dispatch して画像を添付する。
 * helper がアップロード完了まで待つので戻り値時点で確実にサーバ受領済み。
 */
export async function dropImages(
  images: ImageAttachment[],
  dropTargetSelector: string,
): Promise<void> {
  await waitForElement<HTMLElement>(dropTargetSelector, 5000);

  const result = await sendInjectRequest({
    mode: 'drop',
    selector: dropTargetSelector,
    files: images.map((img) => ({ name: img.name, type: img.type, data: img.data })),
  });

  if (!result.ok) {
    throw new Error(result.error ?? '画像添付に失敗(SNS の UI が変わった可能性)');
  }
  console.log(`[Tutti] image upload complete via drop (count=${result.uploadCount ?? 0})`);
  await sleep(300);
}
