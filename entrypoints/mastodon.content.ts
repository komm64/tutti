import { log } from '../src/utils/logger';
import type { ImageAttachment, PostResultMessage } from '../src/messages';
import {
  MASTODON_SELECTORS,
  mastodonAdapter,
} from '../src/adapters/mastodon';
import { executePostFlow } from '../src/utils/post-flow';
import { resolveSelectors } from '../src/utils/selector-overrides';
import { bootstrapContentScript } from '../src/utils/content-script-bootstrap';

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
        log.info(`mastodon detection succeeded via "${s.name}"`);
        return handle;
      }
    } catch (e) {
      log.warn(`mastodon strategy "${s.name}" threw:`, e);
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
  main: () => bootstrapContentScript({
    platform: 'mastodon',
    selectors: MASTODON_SELECTORS,
    detectUser: detectMastodonUser,
    runPost,
  }),
});

async function runPost(text: string, images?: ImageAttachment[], dryRun?: boolean): Promise<PostResultMessage> {
  const sel = await resolveSelectors('mastodon', MASTODON_SELECTORS);
  await executePostFlow({
    prefillsViaUrl: mastodonAdapter.prefillsViaUrl,
    textareaSelector: sel.textarea,
    postButtonSelector: sel.postButton,
    postButtonTexts: ['Publish', 'Toot', 'Post', '投稿', 'トゥート'],
    fileInputSelector: sel.fileInput,
    // 画像に alt テキストが無いと出る "Add alt text?" ダイアログを自動承認
    confirmDialogButtonTexts: ['Post anyway', '投稿する', 'そのまま投稿'],
    text,
    images,
    dryRun,
  });

  // v0.5.8〜 URL 取得は bg 側 (capturePostUrl in background.ts) で行う。
  // Mastodon は post 後 /share → /home へ navigation するため content script が
  // 死ぬ。 「runPost を return → channel-closed で bg が success 確定 → bg が
  // scripting.executeScript で API を叩く」 の流れに変えた。
  return {
    type: 'POST_RESULT',
    platform: 'mastodon',
    success: true,
  };
}
