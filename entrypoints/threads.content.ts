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

function detectThreadsUser(): string | null {
  type Strategy = { name: string; fn: () => string | null };
  const RESERVED = new Set(['home', 'search', 'activity', 'login', 'signup', 'help', 'about', 'i']);

  const strategies: Strategy[] = [
    {
      name: 'aria-label*=Profile + /@',
      fn: () => {
        const a = document.querySelector<HTMLAnchorElement>('a[aria-label*="Profile" i][href^="/@"]');
        return a?.getAttribute('href')?.match(/^\/@([^/?#]+)$/)?.[1] ?? null;
      },
    },
    {
      name: 'aria-label*=プロフィール + /@',
      fn: () => {
        const a = document.querySelector<HTMLAnchorElement>('a[aria-label*="プロフィール"][href^="/@"]');
        return a?.getAttribute('href')?.match(/^\/@([^/?#]+)$/)?.[1] ?? null;
      },
    },
    {
      name: 'profile pic img → ancestor anchor',
      fn: () => {
        // 上部ナビの自分アバター(profile_pic を含む src) → 祖先 <a> の href
        const imgs = Array.from(document.querySelectorAll<HTMLImageElement>('img'));
        for (const img of imgs) {
          if (!/profile|avatar/i.test(img.src) && !/profile|avatar/i.test(img.alt ?? '')) continue;
          let el: HTMLElement | null = img;
          while (el && el.tagName !== 'A') el = el.parentElement;
          if (el && el instanceof HTMLAnchorElement) {
            const m = el.getAttribute('href')?.match(/^\/@([^/?#]+)$/);
            if (m && m[1] && !RESERVED.has(m[1])) return m[1];
          }
        }
        return null;
      },
    },
    {
      name: 'all /@ non-mention non-reserved',
      fn: () => {
        const links = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href^="/@"]'));
        // 投稿内メンションは text="@xxx"。side nav は label / icon のみで text は "Profile" 等
        const candidates: { username: string; weight: number }[] = [];
        for (const l of links) {
          const m = l.getAttribute('href')?.match(/^\/@([^/?#]+)$/);
          if (!m || !m[1] || RESERVED.has(m[1])) continue;
          const text = l.textContent?.trim() ?? '';
          if (text.startsWith('@')) continue; // mention
          // navi / aside / header 配下を優先
          let weight = 1;
          if (l.closest('nav, [role="navigation"], header, aside')) weight += 10;
          if (l.querySelector('img')) weight += 5; // avatar 含むリンク
          candidates.push({ username: m[1], weight });
        }
        candidates.sort((a, b) => b.weight - a.weight);
        return candidates[0]?.username ?? null;
      },
    },
    {
      name: 'inline JSON "username":"xxx"',
      fn: () => {
        // SSR script 内に "username":"xxx" の形で埋まっていることがある
        const scripts = document.querySelectorAll<HTMLScriptElement>('script');
        for (const s of scripts) {
          const t = s.textContent;
          if (!t || t.length < 100) continue;
          // 同じ username が複数回現れるものを優先(自分のは複数箇所で参照される可能性)
          const counts = new Map<string, number>();
          const re = /"username"\s*:\s*"([\w.]+)"/g;
          let m: RegExpExecArray | null;
          while ((m = re.exec(t)) !== null) {
            counts.set(m[1]!, (counts.get(m[1]!) ?? 0) + 1);
          }
          if (counts.size > 0) {
            const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
            const top = sorted[0];
            if (top && top[0]) return top[0];
          }
        }
        return null;
      },
    },
    {
      name: 'meta og:url',
      fn: () => {
        const m = document
          .querySelector<HTMLMetaElement>('meta[property="og:url"]')
          ?.content?.match(/threads\.(?:net|com)\/@([^/?#]+)/);
        return m?.[1] ?? null;
      },
    },
  ];

  for (const s of strategies) {
    try {
      const r = s.fn();
      if (r) {
        log.info(`threads detection succeeded via "${s.name}"`);
        return '@' + r;
      }
    } catch (e) {
      log.warn(`threads strategy "${s.name}" threw:`, e);
    }
  }

  // すべて失敗: デバッグ情報をダンプ
  log.warn('threads: 全戦略失敗。デバッグ情報:');
  console.warn('  title =', document.title);
  console.warn(
    '  metas =',
    Array.from(document.querySelectorAll('meta'))
      .map((m) => ({
        name: m.getAttribute('name'),
        property: m.getAttribute('property'),
        content: m.getAttribute('content')?.slice(0, 80),
      }))
      .filter((m) => m.name || m.property),
  );
  console.warn(
    '  /@ anchors =',
    Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href^="/@"]'))
      .slice(0, 15)
      .map((a) => ({
        href: a.getAttribute('href'),
        text: a.textContent?.trim()?.slice(0, 40),
        ariaLabel: a.getAttribute('aria-label'),
        hasImg: !!a.querySelector('img'),
        inNav: !!a.closest('nav, [role="navigation"], header, aside'),
      })),
  );
  console.warn(
    '  aria-label profile elements =',
    Array.from(document.querySelectorAll<HTMLElement>('[aria-label]'))
      .filter((el) => /profile|プロフィール/i.test(el.getAttribute('aria-label') ?? ''))
      .slice(0, 10)
      .map((el) => ({
        tag: el.tagName,
        ariaLabel: el.getAttribute('aria-label'),
        href: el.getAttribute('href'),
      })),
  );
  return null;
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
