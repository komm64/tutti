import type { ImageAttachment, Message, PostResultMessage } from '../src/messages';
import { TUMBLR_SELECTORS, tumblrAdapter } from '../src/adapters/tumblr';
import { executePostFlow } from '../src/utils/post-flow';
import { detectAndReportUser } from '../src/utils/user-detect';

function detectTumblrUser(): string | null {
  type Strategy = { name: string; fn: () => string | null };
  const strategies: Strategy[] = [
    {
      name: 'localStorage tumblr-user',
      fn: () => {
        try {
          for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (!k || !/user|account/i.test(k)) continue;
            const raw = localStorage.getItem(k);
            if (!raw) continue;
            const m = raw.match(/"name"\s*:\s*"([\w-]+)"/);
            if (m && m[1]) return m[1];
          }
        } catch { /* ignore */ }
        return null;
      },
    },
    {
      name: 'aria-label="Account"',
      fn: () => {
        const a = document.querySelector<HTMLAnchorElement>(
          'a[aria-label*="Account" i][href^="/"]',
        );
        const m = a?.getAttribute('href')?.match(/^\/([\w-]+)$/);
        return m?.[1] ?? null;
      },
    },
    {
      name: 'meta og:url blog',
      fn: () => {
        const m = document
          .querySelector<HTMLMetaElement>('meta[property="og:url"]')
          ?.content?.match(/^https:\/\/(?:www\.)?tumblr\.com\/blog\/view\/([\w-]+)/);
        return m?.[1] ?? null;
      },
    },
  ];

  for (const s of strategies) {
    try {
      const r = s.fn();
      if (r) {
        console.log(`[Tutti] tumblr detection succeeded via "${s.name}" → @${r}`);
        return '@' + r;
      }
    } catch (e) {
      console.warn(`[Tutti] tumblr strategy "${s.name}" threw:`, e);
    }
  }
  console.warn('[Tutti] tumblr: 全戦略失敗');
  return null;
}

export default defineContentScript({
  matches: ['https://www.tumblr.com/*', 'https://tumblr.com/*'],
  main() {
    browser.runtime.onMessage.addListener((rawMsg, _sender, sendResponse) => {
      const msg = rawMsg as Message;
      if (msg.type !== 'POST_TO_PLATFORM' || msg.platform !== 'tumblr') return;

      void runPost(msg.text, msg.images)
        .then((result) => sendResponse(result))
        .catch((err: unknown) => {
          const message = err instanceof Error ? err.message : String(err);
          const result: PostResultMessage = {
            type: 'POST_RESULT',
            platform: 'tumblr',
            success: false,
            error: message,
          };
          sendResponse(result);
        });

      return true;
    });

    void detectAndReportUser('tumblr', detectTumblrUser);
    console.log('[Tutti] Tumblr content script ready');
  },
});

async function runPost(text: string, images?: ImageAttachment[]): Promise<PostResultMessage> {
  await executePostFlow({
    prefillsViaUrl: tumblrAdapter.prefillsViaUrl,
    textareaSelector: TUMBLR_SELECTORS.textarea,
    postButtonSelector: TUMBLR_SELECTORS.postButton,
    postButtonTexts: ['Post', '投稿', 'Publish'],
    fileInputSelector: TUMBLR_SELECTORS.fileInput,
    text,
    images,
    postButtonTimeoutMs: 10000,
  });

  return {
    type: 'POST_RESULT',
    platform: 'tumblr',
    success: true,
  };
}
