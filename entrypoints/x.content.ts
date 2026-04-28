import type { Message, PostResultMessage } from '../src/messages';
import { X_SELECTORS } from '../src/adapters/x';
import {
  insertTextIntoContentEditable,
  sleep,
  waitForElement,
} from '../src/utils/dom';

export default defineContentScript({
  matches: ['https://x.com/*', 'https://twitter.com/*'],
  main() {
    browser.runtime.onMessage.addListener((rawMsg, _sender, sendResponse) => {
      const msg = rawMsg as Message;
      if (msg.type !== 'POST_TO_PLATFORM' || msg.platform !== 'x') return;

      void postToX(msg.text)
        .then((result) => sendResponse(result))
        .catch((err: unknown) => {
          const message = err instanceof Error ? err.message : String(err);
          const result: PostResultMessage = {
            type: 'POST_RESULT',
            platform: 'x',
            success: false,
            error: message,
          };
          sendResponse(result);
        });

      // 非同期 sendResponse を使うため true を返す
      return true;
    });

    console.log('[Tutti] X content script ready');
  },
});

async function postToX(text: string): Promise<PostResultMessage> {
  const textarea = await waitForElement<HTMLElement>(X_SELECTORS.textarea, 8000);
  if (!textarea) {
    throw new Error('X の投稿入力欄が見つかりませんでした');
  }

  insertTextIntoContentEditable(textarea, text);
  // React の onChange を反映する猶予
  await sleep(300);

  const button =
    document.querySelector<HTMLElement>(X_SELECTORS.postButtonInline) ??
    (await waitForElement<HTMLElement>(X_SELECTORS.postButton, 3000));
  if (!button) {
    throw new Error('X の投稿ボタンが見つかりませんでした');
  }
  if (button.getAttribute('aria-disabled') === 'true') {
    throw new Error('X の投稿ボタンが無効化されています(空文字 / 上限超過の可能性)');
  }

  button.click();
  // 投稿処理が走る猶予
  await sleep(1500);

  return {
    type: 'POST_RESULT',
    platform: 'x',
    success: true,
  };
}
