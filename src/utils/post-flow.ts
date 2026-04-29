import type { ImageAttachment } from '../messages';
import {
  insertTextIntoContentEditable,
  sleep,
  waitForElement,
} from './dom';
import { injectImages } from './image';

export interface PostFlowOptions {
  /** URL pre-fill 方式なら true、DOM injection が必要なら false */
  prefillsViaUrl: boolean;
  /** DOM injection 方式の場合のみ必須 */
  textareaSelector?: string;
  /** 投稿ボタンの CSS セレクタ(postButtonFinder を渡す場合は省略可) */
  postButtonSelector?: string;
  /** 投稿ボタンの JS ベース finder。CSS では同定困難な SNS 用(Threads 等)。
   *  指定された場合は postButtonSelector より優先 */
  postButtonFinder?: () => HTMLElement | null;
  /** 画像添付の file input セレクタ(省略時は画像注入をスキップ) */
  fileInputSelector?: string;
  /** 投稿テキスト */
  text: string;
  /** 添付画像(省略可) */
  images?: ImageAttachment[];
  /** 投稿ボタン待機タイムアウト(ms) */
  postButtonTimeoutMs?: number;
  /** 投稿後に処理が走る猶予(ms) */
  afterClickDelayMs?: number;
}

/**
 * SNS 共通の投稿フロー。URL pre-fill 方式なら post button click だけ、
 * DOM injection 方式なら textarea を見つけて inject してから click する。
 * 画像がある場合は post button click 前に file input に注入する。
 */
export async function executePostFlow(options: PostFlowOptions): Promise<void> {
  const {
    prefillsViaUrl,
    textareaSelector,
    postButtonSelector,
    postButtonFinder,
    fileInputSelector,
    text,
    images,
    postButtonTimeoutMs = 8000,
    afterClickDelayMs = 1500,
  } = options;
  if (!postButtonSelector && !postButtonFinder) {
    throw new Error('postButtonSelector か postButtonFinder のいずれかが必要');
  }

  if (!prefillsViaUrl) {
    if (!textareaSelector) {
      throw new Error('DOM injection 方式には textareaSelector が必要');
    }
    const textarea = await waitForElement<HTMLElement>(textareaSelector, 8000);
    if (!textarea) {
      throw new Error('投稿入力欄が見つかりませんでした');
    }
    insertTextIntoContentEditable(textarea, text);
    await sleep(300);
  }

  if (images && images.length > 0) {
    if (!fileInputSelector) {
      throw new Error('このプラットフォームは画像添付に未対応です');
    }
    await injectImages(images, fileInputSelector);
  }

  let button: HTMLElement | null = null;
  if (postButtonFinder) {
    // JS finder 優先(Threads 等の CSS で同定困難な SNS)
    const start = Date.now();
    while (Date.now() - start < postButtonTimeoutMs) {
      button = postButtonFinder();
      if (button) break;
      await sleep(200);
    }
  } else if (postButtonSelector) {
    button = await waitForElement<HTMLElement>(postButtonSelector, postButtonTimeoutMs);
  }
  if (!button) {
    throw new Error('投稿ボタンが見つかりませんでした');
  }
  if (
    button.getAttribute('aria-disabled') === 'true' ||
    (button as HTMLButtonElement).disabled
  ) {
    throw new Error('投稿ボタンが無効化されています(空文字 / 上限超過 / 未ログインの可能性)');
  }

  button.click();
  await sleep(afterClickDelayMs);
}
