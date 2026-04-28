import {
  insertTextIntoContentEditable,
  sleep,
  waitForElement,
} from './dom';

export interface PostFlowOptions {
  /** URL pre-fill 方式なら true、DOM injection が必要なら false */
  prefillsViaUrl: boolean;
  /** DOM injection 方式の場合のみ必須 */
  textareaSelector?: string;
  /** 投稿ボタンの CSS セレクタ(複数候補をカンマ区切りで OK) */
  postButtonSelector: string;
  /** 投稿テキスト */
  text: string;
  /** 投稿ボタン待機タイムアウト(ms) */
  postButtonTimeoutMs?: number;
  /** 投稿後に処理が走る猶予(ms) */
  afterClickDelayMs?: number;
}

/**
 * SNS 共通の投稿フロー。URL pre-fill 方式なら post button click だけ、
 * DOM injection 方式なら textarea を見つけて inject してから click する。
 */
export async function executePostFlow(options: PostFlowOptions): Promise<void> {
  const {
    prefillsViaUrl,
    textareaSelector,
    postButtonSelector,
    text,
    postButtonTimeoutMs = 8000,
    afterClickDelayMs = 1500,
  } = options;

  if (!prefillsViaUrl) {
    if (!textareaSelector) {
      throw new Error('DOM injection 方式には textareaSelector が必要');
    }
    const textarea = await waitForElement<HTMLElement>(textareaSelector, 8000);
    if (!textarea) {
      throw new Error('投稿入力欄が見つかりませんでした');
    }
    insertTextIntoContentEditable(textarea, text);
    // React の onChange を反映する猶予
    await sleep(300);
  }

  const button = await waitForElement<HTMLElement>(
    postButtonSelector,
    postButtonTimeoutMs,
  );
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
