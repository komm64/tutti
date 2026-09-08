import { log } from '../src/utils/logger';
import type {
  ImageAttachment,
  PostImplementationPath,
  PostResultMessage,
} from '../src/messages';
import { THREADS_SELECTORS, threadsAdapter } from '../src/adapters/threads';
import { findClickableByText, sleep, waitForCondition } from '../src/utils/dom';
import { executePostFlow } from '../src/utils/post-flow';
import { clickElementInMainWorld } from '../src/utils/image';
import { resolveSelectors } from '../src/utils/selector-overrides';
import { bootstrapContentScript } from '../src/utils/content-script-bootstrap';
import { hashCaptureText, readFreshCapturedPost } from '../src/utils/post-capture-record';
import { openReplyComposerIfOnPostPage } from '../src/utils/reply-compose';
import { detectThreadsUserFromDocument } from '../src/utils/threads-user-detect';
import { findThreadsMediaRejection, hasThreadsMediaPreview } from '../src/utils/threads-media-preview';
import { resolveThreadsPostEvidenceUrl } from '../src/utils/threads-post-evidence';
import { retryDetachedClick } from '../src/utils/retry-detached-click';
import { settleThreadsPost } from '../src/utils/threads-post-settlement';
import { fetchLatestThreadsPostUrl, normalizeThreadsPostUrl } from '../src/utils/threads-profile';
import { waitForWebActionPacing } from '../src/utils/web-action-pacing';

const THREADS_POST_BUTTON_TEXTS = ['Post', '投稿', '投稿する', 'Post now'];
const THREADS_COMPOSER_TRIGGER_TEXTS = [
  'New thread',
  '新しいスレッド',
  "What's new?",
  '新規投稿',
  '新しい投稿',
  'Create',
];
const THREADS_URL_CAPTURE_TIMEOUT_MS = 25_000;

function detectThreadsUser(): string | null {
  return detectThreadsUserFromDocument(document);
}

export default defineContentScript({
  matches: ['https://www.threads.net/*', 'https://www.threads.com/*'],
  main: () => bootstrapContentScript({
    platform: 'threads',
    selectors: THREADS_SELECTORS,
    detectUser: detectThreadsUser,
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
  const sel = await resolveSelectors('threads', THREADS_SELECTORS);
  const postingUser = detectThreadsUser()?.replace(/^@/, '') ?? null;
  const hasMedia = !!images?.length;
  const hasVideo = !!images?.some((image) => image.type.startsWith('video/'));
  const postSettleTimeoutMs = hasVideo ? 90_000 : hasMedia ? 35_000 : 25_000;
  const preSubmitPostUrl = normalizeThreadsPostUrl(location.href, location.origin);
  const preSubmitProfilePostUrl = !dryRun && postingUser
    ? await fetchLatestThreadsPostUrl(postingUser)
    : undefined;
  if (!dryRun) {
    try {
      localStorage.removeItem('tutti:threads-latest-post');
      localStorage.setItem('tutti:threads-pending-text-hash', hashCaptureText(text));
      if (postingUser) localStorage.setItem('tutti:threads-pending-user', postingUser);
      else localStorage.removeItem('tutti:threads-pending-user');
    } catch { /* ignore storage failures */ }
  }
  const replyTextareaSelector =
    '[role="dialog"] div[contenteditable="true"][role="textbox"], [role="dialog"] div[contenteditable="plaintext-only"]';
  const replyContinuation = await openReplyComposerIfOnPostPage('threads', replyTextareaSelector, {
    timeoutMs: 20_000,
    clickInMainWorld: true,
    implementationPath,
  });
  if (!replyContinuation) {
    await ensureThreadsComposerOpen(sel.textarea);
  }
  const textareaSelector = replyContinuation ? replyTextareaSelector : sel.textarea;
  const dropTargetSelector = replyContinuation
    ? '[role="dialog"] [role="textbox"]'
    : sel.dropTarget;
  await executePostFlow({
    prefillsViaUrl: replyContinuation ? false : threadsAdapter.prefillsViaUrl,
    textareaSelector,
    // Threads の post button は React Native Web で aria-label / data-testid が
    // 不安定。テキスト「投稿」「Post」で探す finder を使う。
    postButtonFinder: findThreadsPostButton,
    fileInputSelector: sel.fileInput,
    dropTargetSelector,
    mediaAttachOrder: ['input', 'drop'],
    text,
    images,
    postButtonTimeoutMs: 12000,
    dryRun,
    implementationPath,
    requireMediaAccepted: hasMedia,
    requireMediaPreview: hasMedia,
    beforeDropDelayMs: hasMedia ? 5000 : undefined,
    beforeSubmit: hasMedia ? () => assertThreadsMediaAttached(hasVideo ? 30_000 : 10_000) : undefined,
    clickPostButton: () => clickLiveThreadsButton(
      '[role="dialog"] [role="button"], [role="dialog"] button',
      THREADS_POST_BUTTON_TEXTS,
      false,
    ),
  });
  if (!dryRun) {
    const capturedPost = captureThreadsPostUrlWithinBudget(
      text,
      postingUser,
      preSubmitProfilePostUrl,
      preSubmitPostUrl,
      THREADS_URL_CAPTURE_TIMEOUT_MS,
    );
    const settlement = await settleThreadsPost({
      timeoutMs: postSettleTimeoutMs,
      isDraftOpen: () => isThreadsDraftOpen(text, textareaSelector),
      findPostEvidence: () => findThreadsPostEvidenceUrl(text, preSubmitPostUrl),
      findRejection: () => findThreadsMediaRejection(document),
    });
    if (settlement.outcome === 'rejected') {
      return {
        type: 'POST_RESULT',
        platform: 'threads',
        success: false,
        flow: {
          mode: 'post',
          submitReached: true,
          lastCompletedStep: 'click-submit',
          failedStep: 'confirm-post',
        },
        error: `Threads rejected the post: ${settlement.rejection}`,
      };
    }

    if (settlement.outcome === 'confirmed') {
      log.info('Threads: post evidence observed after the initial submit');
    } else if (settlement.outcome === 'closed') {
      log.info('Threads: composer closed after the initial submit');
    }

    // Prefer the direct/API evidence observed by settlement. Otherwise await
    // the profile diff, without repeating the irreversible Post action.
    const captured = settlement.url ?? await capturedPost;
    if (captured) {
      return {
        type: 'POST_RESULT',
        platform: 'threads',
        success: true,
        confirmed: true,
        url: captured,
      };
    }

    if (settlement.outcome === 'uncertain') {
      return {
        type: 'POST_RESULT',
        platform: 'threads',
        success: false,
        uncertain: true,
        userAction: 'check-post-before-retry',
        flow: {
          mode: 'post',
          submitReached: true,
          lastCompletedStep: 'click-submit',
          failedStep: 'confirm-post',
        },
        error:
          'Threads kept the original composer open and no post evidence appeared ' +
          'after one submit attempt. Check Threads before retrying.',
      };
    }

    // Closure is useful submit evidence, but the background confirmation policy
    // will downgrade this URL-less result to uncertain before recording success.
    return {
      type: 'POST_RESULT',
      platform: 'threads',
      success: true,
      confirmed: false,
    };
  }

  return {
    type: 'POST_RESULT',
    platform: 'threads',
    success: true,
    confirmed: true,
  };
}

async function ensureThreadsComposerOpen(textareaSelector: string): Promise<void> {
  if (document.querySelector(textareaSelector)) return;

  await retryDetachedClick(
    () => clickLiveThreadsButton(
      '[role="button"], button',
      THREADS_COMPOSER_TRIGGER_TEXTS,
    ),
    () => sleep(150),
  );
  const textarea = await waitForCondition<HTMLElement>(
    () => document.querySelector<HTMLElement>(textareaSelector),
    { timeoutMs: 12_000 },
  );
  if (!textarea) {
    throw new Error('Threads composer dialog did not open from the authenticated home page.');
  }
}

async function clickLiveThreadsButton(
  selector: string,
  texts: readonly string[],
  pace = true,
): Promise<void> {
  if (pace) {
    await waitForWebActionPacing('interaction');
  }
  const target = await waitForCondition<HTMLElement>(
    () => findLiveThreadsButton(selector, texts),
    { timeoutMs: 12_000, intervalMs: 100 },
  );
  if (!target) throw new Error('Threads click target not found');

  const marker = `tutti-threads-click-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  target.setAttribute('data-tutti-click-marker', marker);
  try {
    await clickElementInMainWorld(
      `[data-tutti-click-marker="${marker}"]`,
      undefined,
      { pacing: false },
    );
  } finally {
    target.removeAttribute('data-tutti-click-marker');
  }
}

function findLiveThreadsButton(
  selector: string,
  texts: readonly string[],
): HTMLElement | null {
  for (const element of document.querySelectorAll<HTMLElement>(selector)) {
    const values = [
      element.textContent,
      element.getAttribute('aria-label'),
      element.getAttribute('title'),
    ].map((value) => (value ?? '').replace(/\s+/g, ' ').trim());
    if (!values.some((value) => value && texts.includes(value))) continue;
    if (isDisabled(element) || element.getClientRects().length === 0) continue;
    return element;
  }
  return null;
}

async function assertThreadsMediaAttached(timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const rejection = findThreadsMediaRejection(document);
    if (rejection) throw new Error(`Threads rejected the media: ${rejection}`);
    if (hasThreadsMediaPreview(document)) return;
    await sleep(150);
  }
  throw new Error('Threads media attachment was not accepted; refusing to publish without media.');
}

async function captureThreadsPostUrlWithinBudget(
  text: string,
  username: string | null,
  preSubmitProfilePostUrl: string | undefined,
  preSubmitPostUrl: string | undefined,
  timeoutMs: number,
): Promise<string | null> {
  const deadline = Date.now() + timeoutMs;
  let nextProfileFetchAt = 0;
  while (Date.now() < deadline) {
    const trustedEvidence = findThreadsPostEvidenceUrl(text, preSubmitPostUrl);
    if (trustedEvidence) return trustedEvidence;

    if (username && preSubmitProfilePostUrl && Date.now() >= nextProfileFetchAt) {
      const currentProfilePostUrl = await fetchLatestThreadsPostUrl(
        username,
        Math.min(5_000, Math.max(1, deadline - Date.now())),
      );
      // The exact capture may have arrived while the profile was loading.
      const captured = findThreadsPostEvidenceUrl(text, preSubmitPostUrl) ??
        resolveThreadsPostEvidenceUrl({ preSubmitProfilePostUrl, currentProfilePostUrl });
      if (captured) return captured;
      nextProfileFetchAt = Date.now() + 2_000;
    }
    await sleep(250);
  }
  return null;
}

/**
 * Threads の post button を見つける。
 *   1. aria-label "Post"/"投稿" の完全一致
 *   2. テキスト内容 "Post"/"投稿"/"投稿する" の完全一致(複数あれば最後)
 */
function findThreadsPostButton(): HTMLElement | null {
  const dialogs = Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"], [role="alertdialog"]'));
  for (const dialog of dialogs) {
    const scoped = Array.from(dialog.querySelectorAll<HTMLElement>('button, [role="button"]'))
      .find((el) => /^(Post|投稿|投稿する|Post now)$/.test((el.textContent ?? '').trim()));
    if (scoped) return scoped;
  }
  for (const sel of [
    '[aria-label="Post"]',
    '[aria-label="投稿"]',
    '[aria-label="Post now"]',
  ]) {
    const el = document.querySelector<HTMLElement>(sel);
    if (el) return el;
  }
  return findClickableByText(['Post', '投稿', '投稿する', 'Post now']);
}

function isDisabled(el: HTMLElement): boolean {
  return el.getAttribute('aria-disabled') === 'true' || (el as HTMLButtonElement).disabled === true;
}

function isThreadsDraftOpen(text: string, textareaSelector: string): boolean {
  const dialogs = Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"], [role="alertdialog"]'));
  if (text.trim()) {
    return dialogs.some((dialog) => (dialog.textContent ?? '').includes(text));
  }
  return dialogs.some((dialog) => !!dialog.querySelector(textareaSelector));
}

function findThreadsPostEvidenceUrl(text: string, preSubmitPostUrl?: string): string | undefined {
  const direct = normalizeThreadsPostUrl(location.href, location.origin);
  let exactCapturedPostUrl: string | undefined;
  try {
    exactCapturedPostUrl = readMatchingThreadsCapturedPostUrl(text);
  } catch {
    // Durable capture remains unavailable until the API/profile path resolves.
  }
  // Do not infer confirmation from arbitrary rendered feed links. The open
  // composer and unrelated posts share high-level ancestors on Threads, which
  // can make short text such as hashtags appear to belong to the first stale
  // post link in the document.
  return resolveThreadsPostEvidenceUrl({
    currentPostUrl: direct,
    preSubmitPostUrl,
    exactCapturedPostUrl,
  });
}

function readMatchingThreadsCapturedPostUrl(text: string): string | undefined {
  const record = readFreshCapturedPost(
    localStorage.getItem('tutti:threads-latest-post'),
    text,
    120_000,
  );
  return record?.url && record.textHash === hashCaptureText(text)
    ? record.url
    : undefined;
}
