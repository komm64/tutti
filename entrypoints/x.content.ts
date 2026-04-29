import type { ImageAttachment, Message, PostResultMessage } from '../src/messages';
import { X_SELECTORS, xAdapter } from '../src/adapters/x';
import { executePostFlow } from '../src/utils/post-flow';
import { detectAndReportUser } from '../src/utils/user-detect';

const X_RESERVED_PATHS = new Set([
  'home', 'explore', 'notifications', 'messages', 'i', 'compose',
  'settings', 'search', 'bookmarks', 'lists', 'communities',
]);

function detectXUser(): string | null {
  const link = document.querySelector<HTMLAnchorElement>(
    '[data-testid="AppTabBar_Profile_Link"], [data-testid="DashButton_ProfileIcon_Link"]',
  );
  const href = link?.getAttribute('href');
  const m = href?.match(/^\/([^/?#]+)$/);
  if (m && m[1] && !X_RESERVED_PATHS.has(m[1])) return '@' + m[1];
  return null;
}

export default defineContentScript({
  matches: ['https://x.com/*', 'https://twitter.com/*'],
  main() {
    browser.runtime.onMessage.addListener((rawMsg, _sender, sendResponse) => {
      const msg = rawMsg as Message;
      if (msg.type !== 'POST_TO_PLATFORM' || msg.platform !== 'x') return;

      void runPost(msg.text, msg.images)
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

      return true;
    });

    void detectAndReportUser('x', detectXUser);
    console.log('[Tutti] X content script ready');
  },
});

async function runPost(text: string, images?: ImageAttachment[]): Promise<PostResultMessage> {
  await executePostFlow({
    prefillsViaUrl: xAdapter.prefillsViaUrl,
    textareaSelector: X_SELECTORS.textarea,
    postButtonSelector: `${X_SELECTORS.postButtonInline}, ${X_SELECTORS.postButton}`,
    fileInputSelector: X_SELECTORS.fileInput,
    text,
    images,
  });

  return {
    type: 'POST_RESULT',
    platform: 'x',
    success: true,
  };
}
