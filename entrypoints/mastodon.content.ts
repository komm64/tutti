import type { ImageAttachment, Message, PostResultMessage } from '../src/messages';
import {
  MASTODON_SELECTORS,
  mastodonAdapter,
} from '../src/adapters/mastodon';
import { executePostFlow } from '../src/utils/post-flow';

export default defineContentScript({
  matches: ['https://mastodon.social/*'],
  main() {
    browser.runtime.onMessage.addListener((rawMsg, _sender, sendResponse) => {
      const msg = rawMsg as Message;
      if (msg.type !== 'POST_TO_PLATFORM' || msg.platform !== 'mastodon') return;

      void runPost(msg.text, msg.images)
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

async function runPost(text: string, images?: ImageAttachment[]): Promise<PostResultMessage> {
  await executePostFlow({
    prefillsViaUrl: mastodonAdapter.prefillsViaUrl,
    textareaSelector: MASTODON_SELECTORS.textarea,
    postButtonSelector: MASTODON_SELECTORS.postButton,
    fileInputSelector: MASTODON_SELECTORS.fileInput,
    text,
    images,
  });

  return {
    type: 'POST_RESULT',
    platform: 'mastodon',
    success: true,
  };
}
