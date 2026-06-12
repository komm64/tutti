import type { PlatformId } from '../messages';

export function isKnownComposeUrl(platform: PlatformId, rawUrl: string): boolean {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return false;
  }

  const host = url.hostname.toLowerCase();
  const path = normalizePath(url.pathname);

  switch (platform) {
    case 'x':
      return /^(x|twitter)\.com$/.test(host) &&
        (path === '/compose/post' || path === '/intent/post');
    case 'bluesky':
      return host === 'bsky.app' && path === '/intent/compose';
    case 'threads':
      return /^www\.threads\.(com|net)$/.test(host) && path === '/intent/post';
    case 'mastodon':
    case 'misskey':
      return path === '/share';
    case 'tumblr':
      return /(^|\.)tumblr\.com$/.test(host) && path.startsWith('/new');
    case 'tiktok':
      return /(^|\.)tiktok\.com$/.test(host) && path.startsWith('/upload');
    case 'youtube':
      return host === 'studio.youtube.com' && path.includes('/videos/upload');
    case 'deviantart':
      return /(^|\.)deviantart\.com$/.test(host) && path.startsWith('/submit');
    case 'pixiv':
      return /(^|\.)pixiv\.net$/.test(host) && path.includes('/artworks/new');
    case 'instagram':
      return false;
  }
}

function normalizePath(pathname: string): string {
  const trimmed = pathname.replace(/\/+$/, '');
  return trimmed || '/';
}
