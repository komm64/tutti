import type { ImageAttachment, Message, PostResultMessage } from '../src/messages';
import { MISSKEY_SELECTORS, misskeyAdapter } from '../src/adapters/misskey';
import { executePostFlow } from '../src/utils/post-flow';
import { detectAndReportUser } from '../src/utils/user-detect';

function detectMisskeyUser(): string | null {
  type Strategy = { name: string; fn: () => string | null };
  const strategies: Strategy[] = [
    {
      name: 'localStorage account',
      fn: () => {
        try {
          const raw = localStorage.getItem('account');
          if (raw) {
            const data = JSON.parse(raw) as { username?: string; host?: string };
            if (data.username) return data.username + (data.host ? '@' + data.host : '');
          }
        } catch { /* ignore */ }
        return null;
      },
    },
    {
      name: 'header username',
      fn: () => {
        const t = document.querySelector('header .username, .username[data-cy-username]')?.textContent?.trim();
        return t || null;
      },
    },
    {
      name: 'meta og:url',
      fn: () => {
        const m = document
          .querySelector<HTMLMetaElement>('meta[property="og:url"]')
          ?.content?.match(/misskey[^/]+\/@([\w.-]+)/);
        return m?.[1] ?? null;
      },
    },
  ];
  for (const s of strategies) {
    try {
      const r = s.fn();
      if (r) {
        const handle = r.startsWith('@') ? r : '@' + r;
        console.log(`[Tutti] misskey detection succeeded via "${s.name}" → ${handle}`);
        return handle;
      }
    } catch (e) {
      console.warn(`[Tutti] misskey strategy "${s.name}" threw:`, e);
    }
  }
  console.warn('[Tutti] misskey: 全戦略失敗。localStorage keys =',
    (() => { const ks: string[] = []; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k) ks.push(k); } return ks; })(),
  );
  return null;
}

export default defineContentScript({
  matches: ['https://misskey.io/*'],
  main() {
    browser.runtime.onMessage.addListener((rawMsg, _sender, sendResponse) => {
      const msg = rawMsg as Message;
      if (msg.type !== 'POST_TO_PLATFORM' || msg.platform !== 'misskey') return;

      void runPost(msg.text, msg.images, msg.dryRun)
        .then((result) => sendResponse(result))
        .catch((err: unknown) => {
          const message = err instanceof Error ? err.message : String(err);
          const result: PostResultMessage = {
            type: 'POST_RESULT',
            platform: 'misskey',
            success: false,
            error: message,
          };
          sendResponse(result);
        });

      return true;
    });

    void detectAndReportUser('misskey', detectMisskeyUser);
    console.log('[Tutti] Misskey content script ready');
  },
});

async function runPost(text: string, images?: ImageAttachment[], dryRun?: boolean): Promise<PostResultMessage> {
  await executePostFlow({
    prefillsViaUrl: misskeyAdapter.prefillsViaUrl,
    textareaSelector: MISSKEY_SELECTORS.textarea,
    postButtonSelector: MISSKEY_SELECTORS.postButton,
    postButtonTexts: ['投稿', 'ノート', 'Note', 'Post', 'Submit'],
    fileInputSelector: MISSKEY_SELECTORS.fileInput,
    text,
    images,
    dryRun,
  });

  return {
    type: 'POST_RESULT',
    platform: 'misskey',
    success: true,
  };
}
