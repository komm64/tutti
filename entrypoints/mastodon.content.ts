import type { Message, PostResultMessage } from '../src/messages';
import {
  MASTODON_SELECTORS,
  mastodonAdapter,
} from '../src/adapters/mastodon';
import { executePostFlow } from '../src/utils/post-flow';

export default defineContentScript({
  // v1 では mastodon.social のみ。マルチインスタンス対応は P8 (設定画面) で
  matches: ['https://mastodon.social/*'],
  main() {
    browser.runtime.onMessage.addListener((rawMsg, _sender, sendResponse) => {
      const msg = rawMsg as Message;
      if (msg.type !== 'POST_TO_PLATFORM' || msg.platform !== 'mastodon') return;

      void runPost(msg.text)
        .then((result) => sendResponse(result))
        .catch((err: unknown) => {
          const message = err instanceof Error ? err.message : String(err);
          const result: PostResultMessage = {
            type: 'POST_RESULT',
            platform: 'mastodon',
            success: false,
            error: message,
          };
          sendResponse(result);
        });

      return true;
    });

    console.log('[Tutti] Mastodon content script ready');
  },
});

async function runPost(text: string): Promise<PostResultMessage> {
  await executePostFlow({
    prefillsViaUrl: mastodonAdapter.prefillsViaUrl,
    textareaSelector: MASTODON_SELECTORS.textarea,
    postButtonSelector: MASTODON_SELECTORS.postButton,
    text,
  });

  return {
    type: 'POST_RESULT',
    platform: 'mastodon',
    success: true,
  };
}
