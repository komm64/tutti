/**
 * v0.5.10: 投稿後の interaction polling (like / reply / repost) — A 案。
 *
 * 対象 SNS と auth 経路:
 * - Bluesky: appview (public.api.bsky.app) は no-auth で getPostThread が叩ける。
 *   bg-direct で fetch (tab open 不要)。 host_permission に
 *   `https://public.api.bsky.app/*` を追加済 (wxt.config.ts)。
 * - Mastodon: cookie auth が要るので、 mastodon.social tab が open 中だけ。
 *   page-context (browser.scripting.executeScript, world='MAIN') で
 *   initial-state.meta.access_token を取って /api/v1/statuses/{id} を fetch。
 * - Misskey: 同様。 localStorage.account.token を使って /api/notes/show を POST。
 *
 * 将来他 SNS を API path で対象に加える場合、 ここに pollX() / pollThreads() を
 * 足すだけで bg は変更不要 (registry pattern)。
 */

import type { PlatformId } from '../messages';

export interface InteractionCounts {
  likes: number;
  replies: number;
  reposts: number;
}

/** Bluesky: appview の getPostThread で count を取る。 bg から直接 fetch 可能。 */
export async function pollBluesky(handle: string, tid: string): Promise<InteractionCounts | null> {
  // handle → DID resolve
  const didRes = await fetch(
    `https://public.api.bsky.app/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(handle)}`,
  );
  if (!didRes.ok) return null;
  const { did } = (await didRes.json()) as { did?: string };
  if (!did) return null;
  const uri = `at://${did}/app.bsky.feed.post/${tid}`;
  const res = await fetch(
    `https://public.api.bsky.app/xrpc/app.bsky.feed.getPostThread?uri=${encodeURIComponent(uri)}&depth=0`,
  );
  if (!res.ok) return null;
  const data = (await res.json()) as {
    thread?: { post?: { likeCount?: number; replyCount?: number; repostCount?: number; quoteCount?: number } };
  };
  const post = data.thread?.post;
  if (!post) return null;
  return {
    likes: post.likeCount ?? 0,
    replies: post.replyCount ?? 0,
    reposts: (post.repostCount ?? 0) + (post.quoteCount ?? 0),
  };
}

/** Mastodon: tab open 中だけ。 initial-state の access_token で Bearer 認証。 */
export async function pollMastodon(tabId: number, statusId: string): Promise<InteractionCounts | null> {
  try {
    const results = await browser.scripting.executeScript({
      target: { tabId },
      func: async (statusId: string): Promise<InteractionCounts | null> => {
        const initScript = document.querySelector('script#initial-state');
        if (!initScript) return null;
        let token: string | undefined;
        try {
          const data = JSON.parse(initScript.textContent ?? '{}') as { meta?: { access_token?: string } };
          token = data.meta?.access_token;
        } catch { /* ignore */ }
        if (!token) return null;
        const res = await fetch(`/api/v1/statuses/${statusId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return null;
        const s = (await res.json()) as {
          favourites_count?: number;
          replies_count?: number;
          reblogs_count?: number;
        };
        return {
          likes: s.favourites_count ?? 0,
          replies: s.replies_count ?? 0,
          reposts: s.reblogs_count ?? 0,
        };
      },
      args: [statusId],
      world: 'MAIN',
    });
    return results?.[0]?.result ?? null;
  } catch {
    return null;
  }
}

/** Misskey: tab open 中だけ。 localStorage.account.token で POST 認証。 */
export async function pollMisskey(tabId: number, noteId: string): Promise<InteractionCounts | null> {
  try {
    const results = await browser.scripting.executeScript({
      target: { tabId },
      func: async (noteId: string): Promise<InteractionCounts | null> => {
        const raw = localStorage.getItem('account');
        if (!raw) return null;
        let token: string | undefined;
        try { token = (JSON.parse(raw) as { token?: string; i?: string }).token ?? (JSON.parse(raw) as { i?: string }).i; } catch { /* ignore */ }
        if (!token) return null;
        const res = await fetch('/api/notes/show', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ i: token, noteId }),
        });
        if (!res.ok) return null;
        const n = (await res.json()) as {
          repliesCount?: number;
          renoteCount?: number;
          reactions?: Record<string, number>;
        };
        const reactions = n.reactions ?? {};
        const totalReactions = Object.values(reactions).reduce((a, b) => a + b, 0);
        return {
          likes: totalReactions,
          replies: n.repliesCount ?? 0,
          reposts: n.renoteCount ?? 0,
        };
      },
      args: [noteId],
      world: 'MAIN',
    });
    return results?.[0]?.result ?? null;
  } catch {
    return null;
  }
}

/**
 * URL から polling 用 ID を抽出。
 * v0.5.10 では 3 SNS のみ。 他 SNS は将来 API path 対応時に追加。
 */
export function extractPollingTarget(platform: PlatformId, url: string): {
  bluesky?: { handle: string; tid: string };
  mastodon?: { instanceHost: string; statusId: string };
  misskey?: { instanceHost: string; noteId: string };
} | null {
  try {
    const u = new URL(url);
    if (platform === 'bluesky') {
      // https://bsky.app/profile/<handle>/post/<tid>
      const m = u.pathname.match(/^\/profile\/([^/]+)\/post\/([^/?#]+)/);
      if (!m) return null;
      return { bluesky: { handle: m[1]!, tid: m[2]! } };
    }
    if (platform === 'mastodon') {
      // https://mastodon.social/@user/<id>
      const m = u.pathname.match(/^\/@[^/]+\/(\d+)/);
      if (!m) return null;
      return { mastodon: { instanceHost: u.host, statusId: m[1]! } };
    }
    if (platform === 'misskey') {
      // https://misskey.io/notes/<id>
      const m = u.pathname.match(/^\/notes\/([^/?#]+)/);
      if (!m) return null;
      return { misskey: { instanceHost: u.host, noteId: m[1]! } };
    }
  } catch { /* ignore */ }
  return null;
}

/** poll 対象として A 案の対象 SNS かを判定 */
export function isPollingSupported(platform: PlatformId): boolean {
  return platform === 'bluesky' || platform === 'mastodon' || platform === 'misskey';
}
