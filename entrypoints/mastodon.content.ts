import type { ImageAttachment, Message, PostResultMessage } from '../src/messages';
import {
  MASTODON_SELECTORS,
  mastodonAdapter,
} from '../src/adapters/mastodon';
import { executePostFlow } from '../src/utils/post-flow';
import { detectAndReportUser } from '../src/utils/user-detect';

function detectMastodonUser(): string | null {
  // compose-form の中の display-name__account / account__display-name
  const acc = document.querySelector(
    '.compose-form .display-name__account, .compose-form .account__display-name',
  );
  const text = acc?.textContent?.trim();
  if (text) return text.startsWith('@') ? text : '@' + text;
  // fallback: meta タグ
  const meta = document.querySelector<HTMLMetaElement>('meta[name="initialState"]');
  if (meta) {
    try {
      const data = JSON.parse(meta.content) as { meta?: { me?: string }; accounts?: Record<string, { acct?: string }> };
      const me = data.meta?.me;
      if (me && data.accounts && data.accounts[me]?.acct) {
        return '@' + data.accounts[me]!.acct!;
      }
    } catch { /* ignore */ }
  }
  return null;
}

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

    void detectAndReportUser('mastodon', detectMastodonUser);
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
