import type { ImageAttachment, Message, PostResultMessage } from '../src/messages';
import {
  MASTODON_SELECTORS,
  mastodonAdapter,
} from '../src/adapters/mastodon';
import { executePostFlow } from '../src/utils/post-flow';
import { detectAndReportUser } from '../src/utils/user-detect';

function detectMastodonUser(): string | null {
  type Strategy = { name: string; fn: () => string | null };
  const strategies: Strategy[] = [
    {
      name: 'meta initialState (verify_credentials)',
      fn: () => {
        const meta = document.querySelector<HTMLMetaElement>('div[data-component="Compose"], #initial-state');
        // Mastodon Web は #initial-state スクリプトに JSON を埋める
        const script = document.querySelector<HTMLScriptElement>('script#initial-state');
        if (script) {
          try {
            const data = JSON.parse(script.textContent ?? '{}') as {
              meta?: { me?: string };
              accounts?: Record<string, { acct?: string }>;
            };
            const me = data.meta?.me;
            const acct = me ? data.accounts?.[me]?.acct : null;
            if (acct) return acct;
          } catch { /* ignore */ }
        }
        void meta;
        return null;
      },
    },
    {
      name: 'compose-form display-name',
      fn: () => {
        const acc = document.querySelector(
          '.compose-form .display-name__account, .compose-form .account__display-name',
        );
        const t = acc?.textContent?.trim();
        return t || null;
      },
    },
    {
      name: '.display-name__account anywhere',
      fn: () => {
        const t = document.querySelector('.display-name__account')?.textContent?.trim();
        return t || null;
      },
    },
    {
      name: 'navigation column-link',
      fn: () => {
        const link = document.querySelector<HTMLAnchorElement>(
          'a.column-link[href*="/@"], a[href*="/@"][role="link"]',
        );
        const m = link?.getAttribute('href')?.match(/@([\w.]+)/);
        return m?.[1] ?? null;
      },
    },
    {
      name: 'meta tag with site_username',
      fn: () => {
        const m = document
          .querySelector<HTMLMetaElement>('meta[property="profile:username"]')
          ?.content;
        return m || null;
      },
    },
  ];

  for (const s of strategies) {
    try {
      const r = s.fn();
      if (r) {
        const handle = r.startsWith('@') ? r : '@' + r;
        console.log(`[Tutti] mastodon detection succeeded via "${s.name}" → ${handle}`);
        return handle;
      }
    } catch (e) {
      console.warn(`[Tutti] mastodon strategy "${s.name}" threw:`, e);
    }
  }

  console.warn(
    '[Tutti] mastodon: 全戦略失敗。利用可能な手がかり:',
    {
      hasInitialState: !!document.querySelector('script#initial-state'),
      composeForm: !!document.querySelector('.compose-form'),
      displayNameAccount: !!document.querySelector('.display-name__account'),
    },
  );
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
    postButtonTexts: ['Publish', 'Toot', 'Post', '投稿', 'トゥート'],
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
