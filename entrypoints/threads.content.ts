import { log } from '../src/utils/logger';
import type { ImageAttachment, PostResultMessage } from '../src/messages';
import { THREADS_SELECTORS, threadsAdapter } from '../src/adapters/threads';
import { findClickableByText, sleep, waitForCondition } from '../src/utils/dom';
import { executePostFlow } from '../src/utils/post-flow';
import { clickElementInMainWorld } from '../src/utils/image';
import { waitForPostUrl } from '../src/utils/url-capture';
import { resolveSelectors } from '../src/utils/selector-overrides';
import { bootstrapContentScript } from '../src/utils/content-script-bootstrap';
import { hashCaptureText, readFreshCapturedPost } from '../src/utils/post-capture-record';
import { openReplyComposerIfOnPostPage } from '../src/utils/reply-compose';
import { detectThreadsUserFromDocument } from '../src/utils/threads-user-detect';
import { findThreadsMediaRejection, hasThreadsMediaPreview } from '../src/utils/threads-media-preview';

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

async function runPost(text: string, images?: ImageAttachment[], dryRun?: boolean): Promise<PostResultMessage> {
  const sel = await resolveSelectors('threads', THREADS_SELECTORS);
  const postingUser = detectThreadsUser()?.replace(/^@/, '') ?? null;
  const hasMedia = !!images?.length;
  const hasVideo = !!images?.some((image) => image.type.startsWith('video/'));
  const postSettleTimeoutMs = hasVideo ? 120_000 : hasMedia ? 60_000 : 30_000;
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
  });
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
    requireMediaAccepted: hasMedia,
    requireMediaPreview: hasMedia,
    beforeDropDelayMs: hasMedia ? 5000 : undefined,
    beforeSubmit: hasMedia ? () => assertThreadsMediaAttached(hasVideo ? 30_000 : 10_000) : undefined,
    clickPostButton: () => clickElementInMainWorld(
      '[role="dialog"] [role="button"], [role="dialog"] button',
      ['Post', '投稿', '投稿する', 'Post now'],
    ),
  });
  if (!dryRun) {
    const closed = await waitForCondition<boolean>(
      () => isThreadsDraftOpen(text, textareaSelector) ? null : true,
      { timeoutMs: postSettleTimeoutMs, intervalMs: 500 },
    );
    if (!closed && isThreadsDraftOpen(text, textareaSelector)) {
      const button = findThreadsPostButton();
      if (button && !isDisabled(button)) {
        log.warn('Threads: composer still open after submit; enabled Post button returned, retrying click once');
        await clickElementInMainWorld(
          '[role="dialog"] [role="button"], [role="dialog"] button',
          ['Post', '投稿', '投稿する', 'Post now'],
        );
        await waitForCondition<boolean>(
          () => isThreadsDraftOpen(text, textareaSelector) ? null : true,
          { timeoutMs: Math.min(postSettleTimeoutMs, 60_000), intervalMs: 500 },
        );
      } else {
        log.warn('Threads: composer still open but Post button is disabled/missing; treating as still processing and moving to URL capture');
      }
    }
  }

  // dryRun でなければ post URL を捕捉 (= 本当に landing したことの証跡)。
  // Threads は post 直後に /@<user>/post/<id> へ redirect する… のが期待だが、
  // v0.5.7〜 「redirect 来なかった = 失敗」 と即決しない (実際には landing して
  // いるケースが報告された)。 URL を取れた時は付与、 取れなかった時は url=undefined
  // のまま success=true を返す。 verify は post-verify framework が timeline scrape で補完。
  let url: string | undefined;
  let confirmed = !!dryRun;
  if (!dryRun) {
    let captured: string | null = null;
    const deadline = Date.now() + Math.max(20_000, Math.min(postSettleTimeoutMs, 60_000));
    while (Date.now() < deadline) {
      captured = await waitForPostUrl([
        /^https:\/\/(?:www\.)?threads\.(?:com|net)\/@[^/]+\/post\/[\w-]+/,
      ], 250, 100);
      if (captured || !document.querySelector(sel.textarea)) break;
      await sleep(100);
    }
    if (captured) {
      url = captured;
      confirmed = true;
    } else {
      const apiUrl = await waitForLatestThreadsCapturedPost(text, Math.max(20_000, Math.min(postSettleTimeoutMs, 60_000)));
      if (apiUrl) {
        url = apiUrl;
        confirmed = true;
      } else {
          const profileUrl = await captureThreadsPostUrlFromProfile(text, postingUser, Math.max(30_000, Math.min(postSettleTimeoutMs, 90_000)));
        if (profileUrl) {
          url = profileUrl;
          confirmed = true;
        } else if (postingUser && shouldUseLatestDiff && preSubmitSnapshot.ok) {
          const latestDiffUrl = await captureThreadsPostUrlByLatestDiff(postingUser, preSubmitSnapshot.url, Math.max(30_000, Math.min(postSettleTimeoutMs, 90_000)));
          if (latestDiffUrl) {
            url = latestDiffUrl;
            confirmed = true;
          } else if (!document.querySelector(sel.textarea)) {
            confirmed = true;
          }
        } else if (!document.querySelector(sel.textarea)) {
          confirmed = true;
        }
      }
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

async function waitForLatestThreadsCapturedPost(text: string, timeoutMs: number): Promise<string | null> {
  return await waitForCondition<string>(
    () => {
      try {
        const record = readFreshCapturedPost(
          localStorage.getItem('tutti:threads-latest-post'),
          text,
          120_000,
        );
        return record?.url ?? null;
      } catch {
        return null;
      }
    },
    { timeoutMs, intervalMs: 500 },
  ) ?? null;
}

async function fetchThreadsLatestPostSnapshot(username: string): Promise<{ ok: boolean; url?: string }> {
  try {
    const response = await fetch(`https://www.threads.com/@${encodeURIComponent(username)}`, {
      credentials: 'include',
    });
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

async function captureThreadsPostUrlByLatestDiff(
  username: string,
  preSubmitLatestUrl: string | undefined,
  timeoutMs: number,
): Promise<string | null> {
  const profilePath = `/@${username}`;
  const profileUrl = `https://www.threads.com${profilePath}`;
  if (location.href !== profileUrl) {
    location.assign(profileUrl);
  }
  const loaded = await waitForCondition<boolean>(
    () => location.pathname === profilePath ? true : null,
    { timeoutMs: 10_000, intervalMs: 250 },
  );
  if (!loaded) return null;

  return await waitForCondition<string>(
    () => {
      const latest = findLatestThreadsPostUrlInDocument(document, username, location.origin);
      return latest && latest !== preSubmitLatestUrl ? latest : null;
    },
    {
      timeoutMs,
      intervalMs: 500,
      root: document.body,
      observerInit: {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['href'],
      },
    },
  ) ?? null;
}

async function captureThreadsPostUrlFromProfile(
  text: string,
  username: string | null,
  timeoutMs: number,
): Promise<string | null> {
  if (!username) return null;
  const profileUrl = `https://www.threads.com/@${encodeURIComponent(username)}`;
  if (location.href !== profileUrl) {
    location.assign(profileUrl);
  }
  const loaded = await waitForCondition<boolean>(
    () => location.pathname === `/@${username}` ? true : null,
    { timeoutMs: 10_000, intervalMs: 250 },
  );
  if (!loaded) return null;

  return await waitForCondition<string>(
    () => findThreadsPostUrlByText(text),
    {
      timeoutMs,
      intervalMs: 500,
      root: document.body,
      observerInit: {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
        attributeFilter: ['href'],
      },
    },
  ) ?? null;
}

function findThreadsPostUrlByText(text: string): string | null {
  const target = text.replace(/\s+/g, ' ').trim().slice(0, 60);
  if (!target) return null;
  const normalize = (value: string): string => value.replace(/\s+/g, ' ').trim();
  const links = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href*="/post/"]'))
    .filter((anchor) => /\/@[^/]+\/post\/[\w-]+/.test(anchor.href));
  for (const link of links) {
    let ancestor: HTMLElement | null = link;
    for (let depth = 0; ancestor && depth < 12; depth += 1, ancestor = ancestor.parentElement) {
      if (normalize(ancestor.innerText ?? ancestor.textContent ?? '').includes(target)) {
        return link.href;
      }
    }
  }
  if (normalize(document.body.innerText ?? document.body.textContent ?? '').includes(target)) {
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
