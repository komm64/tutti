import { log } from '../src/utils/logger';
import type { ImageAttachment, PostResultMessage } from '../src/messages';
import { MISSKEY_SELECTORS, misskeyAdapter } from '../src/adapters/misskey';
import { sleep, waitForCondition } from '../src/utils/dom';
import { executePostFlow } from '../src/utils/post-flow';
import { clickElementInMainWorld } from '../src/utils/image';
import { resolveSelectors } from '../src/utils/selector-overrides';
import { bootstrapContentScript } from '../src/utils/content-script-bootstrap';
import { getPostSubmissionStartedAt } from '../src/utils/post-submission-state';
import { isMisskeyComposePresent, isMisskeySignInRequiredPage } from '../src/utils/misskey-page-state';
import { t } from '../src/utils/i18n';

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

async function runPost(text: string, images?: ImageAttachment[], dryRun?: boolean): Promise<PostResultMessage> {
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
    clickPostButton: () => clickElementInMainWorld('button, [role="button"]', ['投稿', 'ノート', 'Note', 'Post', 'Submit']),
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
  // accounts に i (access token) を持つので、 そこから token を取って /api/i/notes で
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

/**
 * v0.5.8〜 Misskey の note URL を REST API で取得。
 * - localStorage の `account` (現在ログイン中のアカウント情報、 `i` フィールドが access token)
 * - /api/i/notes で my account の latest 5 件を取得
 * - text 一致するものを探す
 */
async function fetchMisskeyRecentNoteUrl(text: string, minCreatedAt?: number): Promise<string | undefined> {
  try {
    // Misskey は localStorage の 'account' key に { id, i, ... } を保存
    let token: string | null = null;
    for (let i = 0; i < 5; i += 1) {
      const raw = localStorage.getItem('account');
      if (raw) {
        try {
          const data = JSON.parse(raw) as { token?: string; i?: string };
          if (data.token || data.i) {
            token = data.token ?? data.i ?? null;
            break;
          }
        } catch { /* ignore */ }
      }
      await new Promise((r) => setTimeout(r, 300));
    }
    if (!token) {
      log.warn('misskey: account token not in localStorage, skip URL capture');
      return undefined;
    }
    const target = text.replace(/\s+/g, ' ').trim().slice(0, 60);

    for (let attempt = 0; attempt < 5; attempt += 1) {
      if (attempt > 0) await new Promise((r) => setTimeout(r, 1000));
      const res = await fetch('/api/i/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ i: token, limit: 10 }),
      });
      if (!res.ok) continue;
      const notes = (await res.json()) as Array<{ id?: string; text?: string; createdAt?: string }>;
      for (const n of notes) {
        const noteText = (n.text ?? '').replace(/\s+/g, ' ').trim();
        const createdAt = Date.parse(n.createdAt ?? '');
        const afterStart = !minCreatedAt ||
          (Number.isFinite(createdAt) && createdAt >= minCreatedAt - 5000);
        if (!n.id || !afterStart) continue;
        if ((target ? noteText.startsWith(target) : true)) {
          const url = `${location.origin}/notes/${n.id}`;
          log.info(`misskey: URL captured via API: ${url}`);
          return url;
        }
      }
    }
    log.warn('misskey: post URL not found in recent 5 notes');
  } catch (e) {
    log.warn(`misskey URL capture failed: ${e instanceof Error ? e.message : String(e)}`);
  }
  return undefined;
}

function isMisskeyDraftOpen(text: string): boolean {
  if (location.pathname !== '/share') return false;
  const textareas = Array.from(document.querySelectorAll<HTMLTextAreaElement>('textarea'));
  if (text.trim()) {
    return textareas.some((textarea) => textarea.value.includes(text));
  }
  return textareas.length > 0;
}
