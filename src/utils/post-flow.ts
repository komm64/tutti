import type { ImageAttachment } from '../messages';
import {
  findClickableByText,
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
  /** 投稿ボタンの CSS セレクタ(複数候補をカンマ区切りで OK) */
  postButtonSelector?: string;
  /** CSS が外れた場合のテキストベース fallback。"Post" / "投稿" 等 */
  postButtonTexts?: string[];
  /** 完全カスタム finder。指定された場合は selector / texts を無視 */
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
    postButtonTexts,
    postButtonFinder,
    fileInputSelector,
    text,
    images,
    postButtonTimeoutMs = 8000,
    afterClickDelayMs = 1500,
  } = options;
  if (!postButtonSelector && !postButtonTexts?.length && !postButtonFinder) {
    throw new Error('postButtonSelector / postButtonTexts / postButtonFinder のいずれかが必要');
  }

  if (!prefillsViaUrl) {
    if (!textareaSelector) {
      throw new Error('DOM injection 方式には textareaSelector が必要');
    }
    const textarea = await waitForElement<HTMLElement>(textareaSelector, 8000);
    if (!textarea) {
      throw new Error('投稿入力欄が見つかりませんでした。ログイン済みか確認してください');
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

  // post button 探索: finder > selector > texts の順で優先
  const findButton = (): HTMLElement | null => {
    if (postButtonFinder) return postButtonFinder();
    if (postButtonSelector) {
      const el = document.querySelector<HTMLElement>(postButtonSelector);
      if (el) return el;
    }
    if (postButtonTexts && postButtonTexts.length > 0) {
      return findClickableByText(postButtonTexts);
    }
    return null;
  };

  let button: HTMLElement | null = null;
  const findStart = Date.now();
  while (Date.now() - findStart < postButtonTimeoutMs) {
    button = findButton();
    if (button) break;
    await sleep(200);
  }
  if (!button) {
    throw new Error(
      '投稿ボタンが見つかりませんでした。SNS の UI が更新された可能性があります(Tutti の更新が必要)',
    );
  }
  if (
    button.getAttribute('aria-disabled') === 'true' ||
    (button as HTMLButtonElement).disabled
  ) {
    throw new Error(
      'まだ投稿できる状態になっていません(文字数オーバー / メディア処理中 / 未ログインの可能性)',
    );
  }

  button.click();
  await sleep(afterClickDelayMs);
}
