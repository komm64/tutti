import type { ImageAttachment, Message, PostResultMessage } from '../src/messages';
import { TUMBLR_SELECTORS, tumblrAdapter } from '../src/adapters/tumblr';
import { executePostFlow } from '../src/utils/post-flow';
import { detectAndReportUser } from '../src/utils/user-detect';

function detectTumblrUser(): string | null {
  type Strategy = { name: string; fn: () => string | null };
  const RESERVED = new Set([
    'dashboard', 'explore', 'search', 'inbox', 'messages', 'settings',
    'login', 'register', 'new', 'tagged', 'about', 'help', 'privacy',
    'terms', 'apps', 'developers', 'press', 'jobs', 'staff', 'reblog',
    'communities', 'live', 'tv',
  ]);

  const isLikelyUsername = (s: string | undefined | null): s is string =>
    !!s && /^[\w-]+$/.test(s) && !RESERVED.has(s);

  const isPrimaryBlog = (text: string): string | null => {
    // 候補: primaryBlogName / primary_blog / "isPrimary":true,"name":"xxx" 等
    const patterns: RegExp[] = [
      /"primaryBlogName"\s*:\s*"([\w-]+)"/,
      /"primary_blog_name"\s*:\s*"([\w-]+)"/,
      /"primary"\s*:\s*true[^{}]{0,200}?"name"\s*:\s*"([\w-]+)"/s,
      /"isPrimary"\s*:\s*true[^{}]{0,200}?"name"\s*:\s*"([\w-]+)"/s,
      /"name"\s*:\s*"([\w-]+)"[^{}]{0,200}?"primary"\s*:\s*true/s,
      /"name"\s*:\s*"([\w-]+)"[^{}]{0,200}?"isPrimary"\s*:\s*true/s,
      /"primary_blog"\s*:\s*\{[^}]*?"name"\s*:\s*"([\w-]+)"/s,
    ];
    for (const re of patterns) {
      const m = text.match(re);
      if (isLikelyUsername(m?.[1])) return m![1]!;
    }
    return null;
  };

  const strategies: Strategy[] = [
    {
      name: 'inline script の primary blog マーカー',
      fn: () => {
        const scripts = document.querySelectorAll<HTMLScriptElement>('script');
        for (const s of scripts) {
          const t = s.textContent;
          if (!t || t.length < 100) continue;
          const u = isPrimaryBlog(t);
          if (u) return u;
        }
        return null;
      },
    },
    {
      name: 'localStorage の primary blog マーカー',
      fn: () => {
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (!k) continue;
          const raw = localStorage.getItem(k);
          if (!raw || raw.length < 50) continue;
          const u = isPrimaryBlog(raw);
          if (u) return u;
        }
        return null;
      },
    },
    {
      name: 'aria-label*=Account/Profile のアンカー(article 内除外)',
      fn: () => {
        const links = Array.from(
          document.querySelectorAll<HTMLAnchorElement>('a[aria-label][href^="/"]'),
        ).filter((a) => !a.closest('article, [role="article"]'));
        for (const a of links) {
          const label = a.getAttribute('aria-label') ?? '';
          if (!/account|profile|プロフィール|アカウント/i.test(label)) continue;
          const href = a.getAttribute('href') ?? '';
          const m = href.match(/^\/(?:blog\/view\/)?([^/?#]+)/);
          if (isLikelyUsername(m?.[1])) return m![1];
        }
        return null;
      },
    },
    {
      name: 'global nav 配下の avatar アンカー(article 内除外)',
      fn: () => {
        const all = document.querySelectorAll<HTMLAnchorElement>(
          '[role="navigation"] a[href^="/"], body > header a[href^="/"], body > div > header a[href^="/"]',
        );
        const candidates = Array.from(all).filter(
          (a) => !a.closest('article, [role="article"]'),
        );
        for (const a of candidates) {
          const href = a.getAttribute('href') ?? '';
          const m1 = href.match(/^\/blog\/view\/([^/?#]+)/);
          if (isLikelyUsername(m1?.[1])) return m1![1];
          if (a.querySelector('img')) {
            const m2 = href.match(/^\/([^/?#]+)$/);
            if (isLikelyUsername(m2?.[1])) return m2![1];
          }
        }
        return null;
      },
    },
  ];

  for (const s of strategies) {
    try {
      const r = s.fn();
      if (r) {
        console.log(`[Tutti] tumblr detection succeeded via "${s.name}" → @${r}`);
        return '@' + r;
      }
    } catch (e) {
      console.warn(`[Tutti] tumblr strategy "${s.name}" threw:`, e);
    }
  }

  // 全失敗時のデバッグダンプ
  console.warn('[Tutti] tumblr: 全戦略失敗。デバッグ情報:');
  console.warn('  title =', document.title);
  console.warn(
    '  /blog/view anchors =',
    Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href*="/blog/view/"]'))
      .slice(0, 10)
      .map((a) => ({ href: a.getAttribute('href'), text: a.textContent?.trim()?.slice(0, 30) })),
  );
  console.warn(
    '  aria-label anchors =',
    Array.from(document.querySelectorAll<HTMLElement>('a[aria-label]'))
      .filter((el) => /account|profile|プロフィール|アカウント/i.test(el.getAttribute('aria-label') ?? ''))
      .slice(0, 10)
      .map((el) => ({ ariaLabel: el.getAttribute('aria-label'), href: el.getAttribute('href') })),
  );
  console.warn(
    '  localStorage keys =',
    (() => { const ks: string[] = []; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k) ks.push(k); } return ks; })(),
  );
  return null;
}

export default defineContentScript({
  matches: ['https://www.tumblr.com/*', 'https://tumblr.com/*'],
  main() {
    browser.runtime.onMessage.addListener((rawMsg, _sender, sendResponse) => {
      const msg = rawMsg as Message;
      if (msg.type !== 'POST_TO_PLATFORM' || msg.platform !== 'tumblr') return;

      void runPost(msg.text, msg.images)
        .then((result) => sendResponse(result))
        .catch((err: unknown) => {
          const message = err instanceof Error ? err.message : String(err);
          const result: PostResultMessage = {
            type: 'POST_RESULT',
            platform: 'tumblr',
            success: false,
            error: message,
          };
          sendResponse(result);
        });

      return true;
    });

    void detectAndReportUser('tumblr', detectTumblrUser);
    console.log('[Tutti] Tumblr content script ready');
  },
});

async function runPost(text: string, images?: ImageAttachment[]): Promise<PostResultMessage> {
  await executePostFlow({
    prefillsViaUrl: tumblrAdapter.prefillsViaUrl,
    textareaSelector: TUMBLR_SELECTORS.textarea,
    postButtonSelector: TUMBLR_SELECTORS.postButton,
    postButtonTexts: ['Post', '投稿', 'Publish'],
    fileInputSelector: TUMBLR_SELECTORS.fileInput,
    text,
    images,
    postButtonTimeoutMs: 10000,
  });

  return {
    type: 'POST_RESULT',
    platform: 'tumblr',
    success: true,
  };
}
