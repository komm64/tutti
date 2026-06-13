import { log } from '../src/utils/logger';
import type { ImageAttachment, PostResultMessage } from '../src/messages';
import {
  MASTODON_SELECTORS,
} from '../src/adapters/mastodon';
import { executePostFlow } from '../src/utils/post-flow';
import { resolveSelectors } from '../src/utils/selector-overrides';
import { bootstrapContentScript } from '../src/utils/content-script-bootstrap';
import {
  hashCaptureText,
  readFreshCapturedPost,
} from '../src/utils/post-capture-record';

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
  if (!dryRun) {
    try {
      localStorage.removeItem('tutti:mastodon-latest-post');
      localStorage.setItem('tutti:mastodon-pending-text-hash', hashCaptureText(text));
    } catch { /* ignore storage failures */ }
  }

  await executePostFlow({
    // /share?text= の prefill は Mastodon Web の hydration 状態に左右される。
    // Compose URL は入口として使いつつ、本文は DOM に明示注入して preview/submit
    // の成功条件を安定させる。
    prefillsViaUrl: false,
    textareaSelector: sel.textarea,
    postButtonSelector: sel.postButton,
    postButtonTexts: ['Publish', 'Toot', 'Post', '投稿', 'トゥート'],
    fileInputSelector: sel.fileInput,
    // 画像に alt テキストが無いと出る "Add alt text?" ダイアログを自動承認
    confirmDialogButtonTexts: ['Post anyway', '投稿する', 'そのまま投稿'],
    text,
    images,
    dryRun,
    composeInputTimeoutMs: 30000,
    postButtonTimeoutMs: 30000,
  });

  let url: string | undefined;
  if (!dryRun) {
    const captured = await waitForCapturedMastodonPost(text);
    if (captured?.url) {
      url = captured.url;
      log.info(`mastodon: URL captured via status API response: ${url}`);
    }
  }

  // URL がここで取れない場合は bg 側 capturePostUrl fallback が続けて試す。
  return {
    type: 'POST_RESULT',
    platform: 'mastodon',
    success: true,
    confirmed: true,
    url,
  };
}

async function waitForCapturedMastodonPost(text: string) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    try {
      const captured = readFreshCapturedPost(
        localStorage.getItem('tutti:mastodon-latest-post'),
        text,
        120_000,
      );
      if (captured?.url) return captured;
    } catch { /* ignore storage failures */ }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return undefined;
}
