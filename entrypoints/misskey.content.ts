import { log } from '../src/utils/logger';
import type {
  ImageAttachment,
  PostImplementationPath,
  PostResultMessage,
} from '../src/messages';
import { MISSKEY_SELECTORS, misskeyAdapter } from '../src/adapters/misskey';
import { sleep, waitForCondition } from '../src/utils/dom';
import { executePostFlow } from '../src/utils/post-flow';
import { clickElementInMainWorld } from '../src/utils/image';
import { resolveSelectors } from '../src/utils/selector-overrides';
import { bootstrapContentScript } from '../src/utils/content-script-bootstrap';
import { getPostSubmissionStartedAt } from '../src/utils/post-submission-state';
import { isMisskeyComposePresent, isMisskeySignInRequiredPage } from '../src/utils/misskey-page-state';
import { t } from '../src/utils/i18n';
import { fetchMisskeyRecentNoteUrl } from '../src/utils/misskey-recent-note-url';

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
        log.info(`misskey detection succeeded via "${s.name}"`);
        return handle;
      }
    } catch (e) {
      log.warn(`misskey strategy "${s.name}" threw:`, e);
    }
  }
  log.warn('misskey: 全戦略失敗。localStorage keys =',
    (() => { const ks: string[] = []; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k) ks.push(k); } return ks; })(),
  );
  return null;
}

export default defineContentScript({
  matches: ['https://misskey.io/*'],
  main: () => bootstrapContentScript({
    platform: 'misskey',
    selectors: MISSKEY_SELECTORS,
    detectUser: detectMisskeyUser,
    runPost,
  }),
});

async function runPost(
  text: string,
  images?: ImageAttachment[],
  dryRun?: boolean,
  _textChunks?: string[],
  implementationPath?: PostImplementationPath,
): Promise<PostResultMessage> {
  const sel = await resolveSelectors('misskey', MISSKEY_SELECTORS);
  const initialPageState = await waitForCondition<'compose' | 'sign-in'>(() => {
    if (isMisskeyComposePresent(document, sel)) return 'compose';
    if (isMisskeySignInRequiredPage(document, sel)) return 'sign-in';
    return null;
  }, { timeoutMs: 5000, intervalMs: 200 });
  if (initialPageState === 'sign-in') {
    log.warn('misskey: sign-in required page detected before post flow');
    return buildMisskeySignInRequiredResult(dryRun);
  }

  await executePostFlow({
    prefillsViaUrl: misskeyAdapter.prefillsViaUrl,
    textareaSelector: sel.textarea,
    postButtonSelector: sel.postButton,
    postButtonTexts: ['投稿', 'ノート', 'Note', 'Post', 'Submit'],
    dropTargetSelector: sel.dropTarget,
    text,
    images,
    dryRun,
    implementationPath,
    clickPostButton: () => clickElementInMainWorld(
      'button, [role="button"]',
      ['投稿', 'ノート', 'Note', 'Post', 'Submit'],
      { pacing: false },
    ),
  });
  if (!dryRun) {
    const closed = await waitForCondition<boolean>(
      () => isMisskeyDraftOpen(text) ? null : true,
      { timeoutMs: 30_000, intervalMs: 500 },
    );
    if (!closed && isMisskeyDraftOpen(text)) {
      await clickElementInMainWorld('button, [role="button"]', ['投稿', 'ノート', 'Note', 'Post', 'Submit']);
    }
  }

  // v0.5.8〜 DOM 経路でも post URL を取得する。 Misskey は localStorage の
  // account に id と i (access token) を持つので、そこから /api/users/notes で
  // my account の latest を引く。
  let url: string | undefined;
  if (!dryRun) {
    url = await fetchMisskeyRecentNoteUrl(text, getPostSubmissionStartedAt());
  }

  return {
    type: 'POST_RESULT',
    platform: 'misskey',
    success: true,
    url,
  };
}

function buildMisskeySignInRequiredResult(dryRun?: boolean): PostResultMessage {
  return {
    type: 'POST_RESULT',
    platform: 'misskey',
    success: false,
    userAction: 'sign-in',
    flow: {
      mode: dryRun ? 'preview' : 'post',
      submitReached: false,
      failedStep: 'verify-login',
    },
    error: `${t('failureReasonLogin')} (Misskey)`,
  };
}

function isMisskeyDraftOpen(text: string): boolean {
  if (location.pathname !== '/share') return false;
  const textareas = Array.from(document.querySelectorAll<HTMLTextAreaElement>('textarea'));
  if (text.trim()) {
    return textareas.some((textarea) => textarea.value.includes(text));
  }
  return textareas.length > 0;
}
