import type { ImageAttachment, Message, PostResultMessage } from '../src/messages';
import { BLUESKY_SELECTORS, blueskyAdapter } from '../src/adapters/bluesky';
import { executePostFlow } from '../src/utils/post-flow';

export default defineContentScript({
  matches: ['https://bsky.app/*'],
  main() {
    browser.runtime.onMessage.addListener((rawMsg, _sender, sendResponse) => {
      const msg = rawMsg as Message;
      if (msg.type !== 'POST_TO_PLATFORM' || msg.platform !== 'bluesky') return;

      void runPost(msg.text, msg.images)
        .then((result) => sendResponse(result))
        .catch((err: unknown) => {
          const message = err instanceof Error ? err.message : String(err);
          const result: PostResultMessage = {
            type: 'POST_RESULT',
            platform: 'bluesky',
            success: false,
            error: message,
          };
          sendResponse(result);
        });

      return true;
    });

    console.log('[Tutti] Bluesky content script ready');
  },
});

async function runPost(text: string, images?: ImageAttachment[]): Promise<PostResultMessage> {
  await executePostFlow({
    prefillsViaUrl: blueskyAdapter.prefillsViaUrl,
    textareaSelector: BLUESKY_SELECTORS.textarea,
    postButtonSelector: BLUESKY_SELECTORS.postButton,
    fileInputSelector: BLUESKY_SELECTORS.fileInput,
    text,
    images,
  });

  return {
    type: 'POST_RESULT',
    platform: 'bluesky',
    success: true,
  };
}
