/**
 * 投稿 URL から SNS 固有の post ID (numeric / hash / rkey 等) を抽出する。
 *
 * 用途 (v0.5.5〜):
 * - 履歴 UI で「個別投稿」 へ deep link する時の安定 key
 * - 将来、 SNS の status API ("生きているか / 削除されたか / 凍結か") を
 *   叩く時の input 値。 URL より stable で API でも primary key として使える
 *
 * 取得できなければ null。 URL が absent / 形式不一致 / 想定外の構造 → null で OK。
 *
 * @example
 *   extractPostId('x', 'https://x.com/user/status/1234567890')
 *   // → '1234567890'
 */
import type { PlatformId } from '../messages';

export function extractPostId(platform: PlatformId, url: string | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    const path = u.pathname;
    const search = u.search;

    switch (platform) {
      case 'x': {
        // x.com / twitter.com の /{user}/status/{id}
        const m = path.match(/\/status(?:es)?\/(\d+)/);
        return m?.[1] ?? null;
      }
      case 'bluesky': {
        // bsky.app/profile/{handle}/post/{rkey}
        const m = path.match(/\/post\/([a-zA-Z0-9]+)/);
        return m?.[1] ?? null;
      }
      case 'threads': {
        // threads.net/@{user}/post/{shortcode}
        const m = path.match(/\/post\/([A-Za-z0-9_-]+)/);
        return m?.[1] ?? null;
      }
      case 'mastodon': {
        // {instance}/@{user}/{numericId} or /users/{user}/statuses/{id}
        const m1 = path.match(/\/@[\w@.-]+\/(\d+)/);
        if (m1) return m1[1] ?? null;
        const m2 = path.match(/\/users\/\w+\/statuses\/(\d+)/);
        return m2?.[1] ?? null;
      }
      case 'misskey': {
        // {instance}/notes/{noteId}
        const m = path.match(/\/notes\/([a-zA-Z0-9]+)/);
        return m?.[1] ?? null;
      }
      case 'tumblr': {
        // {blog}.tumblr.com/post/{postId} or /post/{postId}/{slug}
        const m = path.match(/\/post\/(\d+)/);
        return m?.[1] ?? null;
      }
      case 'pixiv': {
        // pixiv.net/artworks/{illustId} or /en/artworks/{illustId}
        const m = path.match(/\/artworks\/(\d+)/);
        return m?.[1] ?? null;
      }
      case 'tiktok': {
        // tiktok.com/@{user}/video/{videoId} or /video/{videoId}
        const m = path.match(/\/video\/(\d+)/);
        return m?.[1] ?? null;
      }
      case 'youtube': {
        // youtu.be/{id}, youtube.com/watch?v={id}, /shorts/{id}
        const watchId = new URLSearchParams(search).get('v');
        if (watchId) return watchId;
        const m1 = path.match(/\/shorts\/([\w-]+)/);
        if (m1) return m1[1] ?? null;
        if (u.hostname === 'youtu.be') {
          const m2 = path.match(/^\/([\w-]+)/);
          return m2?.[1] ?? null;
        }
        return null;
      }
      case 'instagram': {
        // instagram.com/p/{shortcode} or /reel/{shortcode}
        const m = path.match(/\/(?:p|reel)\/([\w-]+)/);
        return m?.[1] ?? null;
      }
      case 'deviantart': {
        // deviantart.com/{user}/art/{title}-{id}
        const m = path.match(/-(\d+)\/?$/);
        return m?.[1] ?? null;
      }
    }
  } catch {
    return null;
  }
  return null;
}
