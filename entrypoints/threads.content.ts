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
import { settleThreadsPost } from '../src/utils/threads-post-settlement';
import { waitForWebActionPacing } from '../src/utils/web-action-pacing';
import { withTimeout } from '../src/utils/promise-timeout';

const THREADS_POST_BUTTON_TEXTS = ['Post', '投稿', '投稿する', 'Post now'];
const THREADS_COMPOSER_TRIGGER_TEXTS = [
  'New thread',
  '新しいスレッド',
  "What's new?",
  '新規投稿',
  '新しい投稿',
  'Create',
];
const THREADS_PROFILE_FETCH_TIMEOUT_MS = 5_000;
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
  const shouldUseLatestDiff = !dryRun && !!postingUser;
  const preSubmitSnapshot = shouldUseLatestDiff && postingUser
    ? await fetchThreadsLatestPostSnapshot(postingUser)
    : { ok: false, url: undefined };
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
    const settlement = await settleThreadsPost({
      timeoutMs: postSettleTimeoutMs,
      isDraftOpen: () => isThreadsDraftOpen(text, textareaSelector),
      findRejection: () => findThreadsMediaRejection(document),
      canRetry: () => {
        const button = findThreadsPostButton();
        return !!button && !isDisabled(button);
      },
      retrySubmit: async () => {
        log.warn('Threads: unchanged composer has an enabled Post button; retrying submit');
        await clickLiveThreadsButton(
          '[role="dialog"] [role="button"], [role="dialog"] button',
          THREADS_POST_BUTTON_TEXTS,
        );
      },
      onRetryError: (error) => {
        log.warn(`Threads: retry click failed; continuing bounded settlement checks: ${error instanceof Error ? error.message : String(error)}`);
      },
    });
    if (settlement.rejection) {
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
    if (!settlement.closed) {
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
          `Threads kept the original composer open after ${settlement.retries + 1} submit attempts ` +
          `within ${postSettleTimeoutMs}ms. Check Threads before retrying.`,
      };
    }
    log.info(`Threads: composer closed after submit (${settlement.retries} retries)`);
  }

  // dryRun でなければ post URL を捕捉 (= 本当に landing したことの証跡)。
  // Threads は post 直後に /@<user>/post/<id> へ redirect する… のが期待だが、
  // v0.5.7〜 「redirect 来なかった = 失敗」 と即決しない (実際には landing して
  // いるケースが報告された)。 URL を取れた時は付与、 取れなかった時は url=undefined
  // のまま success=true を返す。 verify は post-verify framework が timeline scrape で補完。
  let url: string | undefined;
  let confirmed = !!dryRun;
  if (!dryRun) {
    const captured = await captureThreadsPostUrlWithinBudget(
      text,
      postingUser,
      preSubmitSnapshot,
      preSubmitPostUrl,
      THREADS_URL_CAPTURE_TIMEOUT_MS,
    );
    if (captured) {
      url = captured;
      confirmed = true;
    } else {
      // Composer closure is useful submit evidence, but the background still
      // requires a durable URL before it records this as a confirmed success.
      confirmed = !isThreadsDraftOpen(text, textareaSelector);
    }
  }

  return {
    type: 'POST_RESULT',
    platform: 'threads',
    success: true,
    confirmed,
    url,
  };
}

async function ensureThreadsComposerOpen(textareaSelector: string): Promise<void> {
  if (document.querySelector(textareaSelector)) return;

  await clickLiveThreadsButton(
    '[role="button"], button',
    THREADS_COMPOSER_TRIGGER_TEXTS,
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

async function fetchThreadsLatestPostSnapshot(username: string): Promise<{ ok: boolean; url?: string }> {
  const controller = new AbortController();
  try {
    const response = await withTimeout(
      fetch(`https://www.threads.com/@${encodeURIComponent(username)}`, {
        credentials: 'include',
        signal: controller.signal,
      }),
      THREADS_PROFILE_FETCH_TIMEOUT_MS,
      'Threads profile snapshot',
      () => controller.abort(),
    );
    if (!response.ok) return { ok: false };
    const doc = new DOMParser().parseFromString(await response.text(), 'text/html');
    return {
      ok: true,
      url: findLatestThreadsPostUrlInDocument(doc, username, location.origin),
    };
  } catch (e) {
    log.warn(`threads: latest profile URL capture failed: ${e instanceof Error ? e.message : String(e)}`);
  }
  return { ok: false };
}

async function captureThreadsPostUrlWithinBudget(
  text: string,
  username: string | null,
  preSubmitSnapshot: { ok: boolean; url?: string },
  preSubmitPostUrl: string | undefined,
  timeoutMs: number,
): Promise<string | null> {
  const deadline = Date.now() + timeoutMs;
  let nextProfileFetchAt = 0;
  while (Date.now() < deadline) {
    const direct = normalizeThreadsPostUrl(location.href, location.origin);
    if (direct && direct !== preSubmitPostUrl) return direct;

    try {
      const record = readFreshCapturedPost(
        localStorage.getItem('tutti:threads-latest-post'),
        text,
        120_000,
      );
      if (record?.url) return record.url;
    } catch { /* ignore storage failures */ }

    const rendered = findThreadsPostUrlByText(text, document);
    if (rendered) return rendered;

    if (username && Date.now() >= nextProfileFetchAt) {
      const snapshot = await fetchThreadsLatestPostSnapshot(username);
      if (
        snapshot.url &&
        (!preSubmitSnapshot.ok || snapshot.url !== preSubmitSnapshot.url)
      ) {
        return snapshot.url;
      }
      nextProfileFetchAt = Date.now() + 2_000;
    }
    await sleep(250);
  }
  return null;
}

function findThreadsPostUrlByText(text: string, doc: Document): string | null {
  const target = text.replace(/\s+/g, ' ').trim().slice(0, 60);
  if (!target) return null;
  const normalize = (value: string): string => value.replace(/\s+/g, ' ').trim();
  const links = Array.from(doc.querySelectorAll<HTMLAnchorElement>('a[href*="/post/"]'))
    .filter((anchor) => /\/@[^/]+\/post\/[\w-]+/.test(anchor.href));
  for (const link of links) {
    let ancestor: HTMLElement | null = link;
    for (let depth = 0; ancestor && depth < 12; depth += 1, ancestor = ancestor.parentElement) {
      if (normalize(ancestor.innerText ?? ancestor.textContent ?? '').includes(target)) {
        return link.href;
      }
    }
  }
  if (normalize(doc.body.innerText ?? doc.body.textContent ?? '').includes(target)) {
    return links[0]?.href ?? null;
  }
  return null;
}

function findLatestThreadsPostUrlInDocument(doc: Document, username: string, origin: string): string | undefined {
  const escapedUser = escapeRegExp(username);
  const links = Array.from(doc.querySelectorAll<HTMLAnchorElement>('a[href*="/post/"]'));
  const seen = new Set<string>();
  for (const link of links) {
    const href = link.getAttribute('href') ?? '';
    const url = normalizeThreadsPostUrl(href, origin);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    if (!new RegExp(`/@${escapedUser}/post/[\\w-]+`, 'i').test(new URL(url).pathname)) continue;
    return url;
  }
  return undefined;
}

function normalizeThreadsPostUrl(href: string, origin: string): string | undefined {
  try {
    const url = new URL(href, origin);
    const match = url.href.match(/^https:\/\/(?:www\.)?threads\.(?:com|net)\/@([^/]+)\/post\/([\w-]+)(?:[/?#]|$)/);
    if (!match?.[1] || !match?.[2]) return undefined;
    url.search = '';
    url.hash = '';
    return `https://www.threads.com/@${match[1]}/post/${match[2]}`;
  } catch {
    return undefined;
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
