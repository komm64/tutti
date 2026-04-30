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

  const strategies: Strategy[] = [
    {
      name: 'localStorage 内 JSON の "name" 出現回数最多',
      fn: () => {
        const counts = new Map<string, number>();
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (!k) continue;
          const raw = localStorage.getItem(k);
          if (!raw || raw.length < 50) continue;
          const re = /"name"\s*:\s*"([\w-]+)"/g;
          let m: RegExpExecArray | null;
          while ((m = re.exec(raw)) !== null) {
            const v = m[1]!;
            if (isLikelyUsername(v)) counts.set(v, (counts.get(v) ?? 0) + 1);
          }
        }
        if (counts.size === 0) return null;
        const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
        return sorted[0]?.[0] ?? null;
      },
    },
    {
      name: 'header / nav の avatar アンカー',
      fn: () => {
        const avatars = document.querySelectorAll<HTMLAnchorElement>(
          'header a[href^="/"], [role="navigation"] a[href^="/"]',
        );
        for (const a of avatars) {
          const href = a.getAttribute('href') ?? '';
          // /blog/view/{name} 形式 (旧 layout)
          const m1 = href.match(/^\/blog\/view\/([^/?#]+)/);
          if (isLikelyUsername(m1?.[1])) return m1![1];
          // 直下に img(avatar) を含むものを優先
          if (a.querySelector('img')) {
            const m2 = href.match(/^\/([^/?#]+)$/);
            if (isLikelyUsername(m2?.[1])) return m2![1];
          }
        }
        return null;
      },
    },
    {
      name: 'aria-label*="Account" / "Profile" のアンカー',
      fn: () => {
        const links = document.querySelectorAll<HTMLAnchorElement>(
          'a[aria-label][href^="/"]',
        );
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
      name: '<head> 内 inline JSON の "primary":{"name":"xxx"} など',
      fn: () => {
        const scripts = document.querySelectorAll<HTMLScriptElement>('script');
        for (const s of scripts) {
          const t = s.textContent;
          if (!t || t.length < 100) continue;
          // primary blog の name フィールドを優先
          const m = t.match(/"primary"\s*:\s*(?:true|\{[^}]*"name"\s*:\s*"([\w-]+)")/);
          if (isLikelyUsername(m?.[1])) return m![1];
          // ditto: "isPrimary": true 直前の name
          const m2 = t.match(/"name"\s*:\s*"([\w-]+)"[^}]*"isPrimary"\s*:\s*true/);
          if (isLikelyUsername(m2?.[1])) return m2![1];
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
