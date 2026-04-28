import type { ImageAttachment, Message, PostResultMessage } from '../src/messages';
import { THREADS_SELECTORS, threadsAdapter } from '../src/adapters/threads';
import { executePostFlow } from '../src/utils/post-flow';

export default defineContentScript({
  matches: ['https://www.threads.net/*'],
  main() {
    browser.runtime.onMessage.addListener((rawMsg, _sender, sendResponse) => {
      const msg = rawMsg as Message;
      if (msg.type !== 'POST_TO_PLATFORM' || msg.platform !== 'threads') return;

      void runPost(msg.text, msg.images)
        .then((result) => sendResponse(result))
        .catch((err: unknown) => {
          const message = err instanceof Error ? err.message : String(err);
          const result: PostResultMessage = {
            type: 'POST_RESULT',
            platform: 'threads',
            success: false,
            error: message,
          };
          sendResponse(result);
        });

      return true;
    });

    console.log('[Tutti] Threads content script ready');
  },
});

async function runPost(text: string, images?: ImageAttachment[]): Promise<PostResultMessage> {
  await executePostFlow({
    prefillsViaUrl: threadsAdapter.prefillsViaUrl,
    textareaSelector: THREADS_SELECTORS.textarea,
    postButtonSelector: THREADS_SELECTORS.postButton,
    fileInputSelector: THREADS_SELECTORS.fileInput,
    text,
    images,
    // Threads は React Native Web で描画が遅いことがあるので長め
    postButtonTimeoutMs: 12000,
  });

  return {
    type: 'POST_RESULT',
    platform: 'threads',
    success: true,
  };
}
