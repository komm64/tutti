import type { PlatformId } from '../messages';
import type { PlatformOption } from './types';

export const MAX_IMAGES = 4;

/**
 * 表示順は X → Bluesky → Threads → Tumblr → Mastodon → Misskey → Pixiv → DeviantArt の固定。
 * Bluesky は MAU 順なら 4 位だが、Tutti として推したい SNS なので X の隣 (2 位) に置く。
 * その他は概ね MAU 順。Pixiv / DeviantArt は image-only クリエイター向けなので末尾。
 */
export const POPUP_PLATFORMS: PlatformOption[] = [
  { id: 'x', name: 'X', limit: 280, available: true },
  { id: 'bluesky', name: 'Bluesky', limit: 300, available: true },
  { id: 'threads', name: 'Threads', limit: 500, available: true },
  { id: 'tumblr', name: 'Tumblr', limit: 4096, available: true },
  { id: 'mastodon', name: 'Mastodon', limit: 500, available: true },
  { id: 'misskey', name: 'Misskey', limit: 3000, available: true },
  { id: 'pixiv', name: 'Pixiv', limit: 1000, available: true },
  { id: 'deviantart', name: 'DeviantArt', limit: 5000, available: true },
  { id: 'instagram', name: 'Instagram', limit: 2200, available: true },
  { id: 'tiktok', name: 'TikTok', limit: 2200, available: true },
  { id: 'youtube', name: 'YouTube', limit: 5000, available: true },
];

export const DEFAULT_SELECTED_PLATFORMS: Record<PlatformId, boolean> = {
  x: true,
  bluesky: true,
  threads: true,
  mastodon: true,
  misskey: true,
  tumblr: true,
  pixiv: false,
  deviantart: false,
  instagram: false,
  tiktok: false,
  youtube: false,
};

export function resolveTuttiContext(
  pathname: string = location.pathname,
  search: string = location.search,
): 'popup' | 'sidepanel' | 'floating' {
  if (pathname.includes('sidepanel.html')) return 'sidepanel';
  if (new URLSearchParams(search).get('floating') === '1') return 'floating';
  return 'popup';
}
