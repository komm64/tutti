import type { ImageAttachment, Message, PostResultMessage } from '../src/messages';
import { THREADS_SELECTORS, threadsAdapter } from '../src/adapters/threads';
import { findClickableByText } from '../src/utils/dom';
import { executePostFlow } from '../src/utils/post-flow';
import { buildDiagnosis } from '../src/utils/diagnose';
import { resolveSelectors } from '../src/utils/selector-overrides';
import { detectAndReportUser } from '../src/utils/user-detect';

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
        console.log(`[Tutti] threads detection succeeded via "${s.name}" → @${r}`);
        return '@' + r;
      }
    } catch (e) {
      console.warn(`[Tutti] threads strategy "${s.name}" threw:`, e);
    }
  }

  // すべて失敗: デバッグ情報をダンプ
  console.warn('[Tutti] threads: 全戦略失敗。デバッグ情報:');
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
  main() {
    browser.runtime.onMessage.addListener((rawMsg, _sender, sendResponse) => {
      const msg = rawMsg as Message;
      if (msg.type === 'DIAGNOSE_PLATFORM' && msg.platform === 'threads') {
        sendResponse(buildDiagnosis('threads', THREADS_SELECTORS, detectThreadsUser));
        return true;
      }
      if (msg.type !== 'POST_TO_PLATFORM' || msg.platform !== 'threads') return;

      void runPost(msg.text, msg.images, msg.dryRun)
        .then((result) => sendResponse(result))
        .catch((err: unknown) => {
          const message = err instanceof Error ? err.message : String(err);
          const result: PostResultMessage = {
            type: 'POST_RESULT',
            platform: 'threads',
            success: false,
            error: message,
          };
          sendResponse(result);
        });

      return true;
    });

    void detectAndReportUser('threads', detectThreadsUser);
    console.log('[Tutti] Threads content script ready');
  },
});

async function runPost(text: string, images?: ImageAttachment[], dryRun?: boolean): Promise<PostResultMessage> {
  const sel = await resolveSelectors('threads', THREADS_SELECTORS);
  await executePostFlow({
    prefillsViaUrl: threadsAdapter.prefillsViaUrl,
    textareaSelector: sel.textarea,
    // Threads の post button は React Native Web で aria-label / data-testid が
    // 不安定。テキスト「投稿」「Post」で探す finder を使う。
    postButtonFinder: findThreadsPostButton,
    fileInputSelector: sel.fileInput,
    text,
    images,
    postButtonTimeoutMs: 12000,
    dryRun,
  });

  return {
    type: 'POST_RESULT',
    platform: 'threads',
    success: true,
  };
}

/**
 * Threads の post button を見つける。
 *   1. aria-label "Post"/"投稿" の完全一致
 *   2. テキスト内容 "Post"/"投稿"/"投稿する" の完全一致(複数あれば最後)
 */
function findThreadsPostButton(): HTMLElement | null {
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
