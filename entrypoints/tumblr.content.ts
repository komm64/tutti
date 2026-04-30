import type { ImageAttachment, Message, PostResultMessage } from '../src/messages';
import { TUMBLR_SELECTORS, tumblrAdapter } from '../src/adapters/tumblr';
import { executePostFlow } from '../src/utils/post-flow';
import { detectAndReportUser } from '../src/utils/user-detect';

async function detectTumblrUser(): Promise<string | null> {
  type Strategy = { name: string; fn: () => string | null | Promise<string | null> };
  const RESERVED = new Set([
    'dashboard', 'explore', 'search', 'inbox', 'messages', 'settings',
    'login', 'register', 'new', 'tagged', 'about', 'help', 'privacy',
    'terms', 'apps', 'developers', 'press', 'jobs', 'staff', 'reblog',
    'communities', 'live', 'tv',
    // UI generic words (alt='Avatar' 等の誤検出を防ぐ)
    'avatar', 'profile', 'user', 'account', 'menu', 'home', 'photo',
    'image', 'icon', 'logo', 'banner', 'header', 'footer', 'sidebar',
    'main', 'me', 'myself', 'thumbnail', 'preview', 'media',
  ]);

  const isLikelyUsername = (s: string | undefined | null): s is string =>
    !!s && /^[\w-]{2,}$/.test(s) && !RESERVED.has(s.toLowerCase());

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
      name: 'page-context inject: window globals',
      fn: () => probePageWorldForUsername(isLikelyUsername),
    },
    {
      name: 'fetch /api/v2/user/info (cookie auth)',
      fn: async () => {
        try {
          const res = await fetch('/api/v2/user/info', { credentials: 'include' });
          console.log(`[Tutti] tumblr API /user/info status=${res.status}`);
          if (!res.ok) {
            console.warn(`[Tutti] tumblr API failed: HTTP ${res.status}`);
            return null;
          }
          const data = await res.json() as {
            response?: { user?: { name?: string; blogs?: { name?: string; primary?: boolean }[] } };
          };
          const user = data?.response?.user;
          console.log(`[Tutti] tumblr API user.name=${user?.name} blogs=`,
            user?.blogs?.map((b) => `${b?.name}${b?.primary ? '*' : ''}`).join(', '));
          const primary = user?.blogs?.find((b) => b?.primary);
          if (isLikelyUsername(primary?.name)) return primary!.name!;
          if (isLikelyUsername(user?.name)) return user!.name!;
          if (isLikelyUsername(user?.blogs?.[0]?.name)) return user!.blogs![0]!.name!;
        } catch (e) {
          console.warn('[Tutti] tumblr API threw:', e);
        }
        return null;
      },
    },
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
      name: 'avatar img の alt/src 内の username',
      fn: () => {
        const imgs = Array.from(document.querySelectorAll<HTMLImageElement>('img')).filter(
          (img) => !img.closest('article, [role="article"]'),
        );
        for (const img of imgs) {
          // alt が "username" や "@username" になることがある
          const alt = (img.alt ?? '').replace(/^@/, '').trim();
          if (isLikelyUsername(alt)) return alt;
          // src が ".../{username}_*_avatar.*" 形式のことがある(Tumblr CDN)
          const src = img.src ?? '';
          const m = src.match(/\/([\w-]+)\/avatar/) || src.match(/avatar\/([\w-]+)\//);
          if (isLikelyUsername(m?.[1])) return m![1]!;
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
      const r = await Promise.resolve(s.fn());
      if (r) {
        console.log(`[Tutti] tumblr detection succeeded via "${s.name}" → @${r}`);
        return '@' + r;
      }
    } catch (e) {
      console.warn(`[Tutti] tumblr strategy "${s.name}" threw:`, e);
    }
  }

  // 全失敗時のデバッグダンプ(単一の console.warn にまとめてコピペしやすく)
  const lsKeys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k) lsKeys.push(k);
  }
  const blogViewAnchors = Array.from(
    document.querySelectorAll<HTMLAnchorElement>('a[href*="/blog/view/"]'),
  )
    .slice(0, 10)
    .map((a) => `    href=${a.getAttribute('href')} text=${a.textContent?.trim()?.slice(0, 30) ?? ''}`)
    .join('\n');
  const ariaLabelAnchors = Array.from(document.querySelectorAll<HTMLElement>('a[aria-label]'))
    .filter((el) => /account|profile|プロフィール|アカウント|menu/i.test(el.getAttribute('aria-label') ?? ''))
    .slice(0, 10)
    .map((el) => `    aria-label=${el.getAttribute('aria-label')} href=${el.getAttribute('href')}`)
    .join('\n');
  const avatarImgs = Array.from(document.querySelectorAll<HTMLImageElement>('img'))
    .filter((img) => !img.closest('article, [role="article"]'))
    .filter((img) => /avatar/i.test(img.src) || /avatar/i.test(img.alt ?? ''))
    .slice(0, 10)
    .map((img) => `    alt=${img.alt} src=${img.src.slice(0, 100)}`)
    .join('\n');

  console.warn(
    `[Tutti] tumblr: 全戦略失敗。デバッグ情報:
  title = ${document.title}
  url = ${location.href}
  localStorage keys (count=${lsKeys.length}):
    ${lsKeys.join(', ')}
  /blog/view anchors (top 10):
${blogViewAnchors || '    (none)'}
  aria-label anchors (account/profile/menu):
${ariaLabelAnchors || '    (none)'}
  avatar imgs (top 10, article 外):
${avatarImgs || '    (none)'}`,
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

/**
 * page world に <script> を注入して window globals を読み、
 * postMessage で isolated world に戻す。CSP で禁止されている場合は失敗する。
 */
function probePageWorldForUsername(
  isLikelyUsername: (s: string | undefined | null) => s is string,
): Promise<string | null> {
  return new Promise((resolve) => {
    const id = 'tutti-tumblr-probe-' + Math.random().toString(36).slice(2);
    let timer: ReturnType<typeof setTimeout> | null = null;

    const handler = (e: MessageEvent) => {
      if (e.source !== window) return;
      const data = e.data as { id?: string; payload?: unknown; error?: string } | null;
      if (!data || data.id !== id) return;
      window.removeEventListener('message', handler);
      if (timer) clearTimeout(timer);
      if (data.error) {
        console.warn('[Tutti] tumblr page-world probe error:', data.error);
        resolve(null);
        return;
      }
      const payload = data.payload as Record<string, unknown> | null;
      console.log('[Tutti] tumblr page-world probe payload:', payload);
      if (!payload) { resolve(null); return; }
      // 候補となるフィールドを順に当たる
      const candidates: unknown[] = [
        (payload.tumblr as Record<string, unknown> | undefined)?.['user'],
        (payload.tumblr as Record<string, unknown> | undefined)?.['name'],
        payload.primaryBlogName,
        payload.userName,
        payload.user,
      ];
      for (const c of candidates) {
        if (typeof c === 'string' && isLikelyUsername(c)) { resolve(c); return; }
        if (c && typeof c === 'object') {
          const o = c as Record<string, unknown>;
          if (typeof o['name'] === 'string' && isLikelyUsername(o['name'])) {
            resolve(o['name']); return;
          }
          if (typeof o['primaryBlogName'] === 'string' && isLikelyUsername(o['primaryBlogName'])) {
            resolve(o['primaryBlogName']); return;
          }
        }
      }
      resolve(null);
    };
    window.addEventListener('message', handler);

    const probeFn = `(function() {
      try {
        const w = window;
        const collect = (obj, depth) => {
          if (!obj || typeof obj !== 'object' || depth > 3) return null;
          const keys = ['name', 'primaryBlogName', 'username', 'blogName'];
          for (const k of keys) if (typeof obj[k] === 'string') return { [k]: obj[k] };
          return null;
        };
        const payload = {
          tumblr: w.tumblr ? { user: w.tumblr.user, name: w.tumblr.name, blog: w.tumblr.blog } : null,
          tumblrUser: collect(w.tumblr_user, 0),
          initialState: w.__INITIAL_STATE__ ? collect(w.__INITIAL_STATE__.user || w.__INITIAL_STATE__, 0) : null,
          apolloState: w.__APOLLO_STATE__ ? collect(w.__APOLLO_STATE__, 0) : null,
          // bx 系 cookie はおそらく user_data 含むかも
          bx: typeof w.__bx_userdata !== 'undefined' ? w.__bx_userdata : null,
          // 全 window プロパティから関連っぽいものを軽く列挙
          windowKeys: Object.getOwnPropertyNames(w).filter((k) => /tumblr|user|blog|init|apollo|state/i.test(k)).slice(0, 20),
        };
        window.postMessage({ id: '${id}', payload }, '*');
      } catch (e) {
        window.postMessage({ id: '${id}', error: String(e) }, '*');
      }
    })();`;

    try {
      const script = document.createElement('script');
      script.textContent = probeFn;
      document.documentElement.appendChild(script);
      script.remove();
    } catch (e) {
      console.warn('[Tutti] tumblr page-world script inject threw:', e);
      window.removeEventListener('message', handler);
      resolve(null);
      return;
    }

    timer = setTimeout(() => {
      window.removeEventListener('message', handler);
      console.warn('[Tutti] tumblr page-world probe timeout (CSP でブロックされた可能性)');
      resolve(null);
    }, 2000);
  });
}
