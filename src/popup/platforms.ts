import { adapters } from '../adapters/registry';
import type { PlatformAdapter } from '../adapters/types';
import type { PlatformId } from '../types/platform';
import type { PlatformOption } from './types';

export const MAX_IMAGES = 4;

type PopupPlatformMetadata = Pick<
  PlatformAdapter,
  'name' | 'charLimit' | 'popupOrder' | 'defaultSelected'
>;
type PopupPlatformRegistry = Readonly<Record<PlatformId, PopupPlatformMetadata | undefined>>;

/**
 * 表示順は X → Bluesky → Threads → Tumblr → Mastodon → Misskey → Pixiv → DeviantArt
 * → Instagram → TikTok → YouTube。
 * Bluesky は MAU 順なら 4 位だが、Tutti として推したい SNS なので X の隣 (2 位) に置く。
 * その他は概ね MAU 順。順序・表示名・文字数上限・初期選択は adapter descriptor を SoT とする。
 */
export function buildPopupPlatformConfig(registry: PopupPlatformRegistry): {
  platforms: PlatformOption[];
  defaultSelected: Record<PlatformId, boolean>;
} {
  const ids = Object.keys(registry) as PlatformId[];
  const sourceOrder = new Map(ids.map((id, index) => [id, index]));
  const platforms = ids
    .map((id): PlatformOption => {
      const adapter = registry[id];
      return {
        id,
        name: adapter?.name ?? id,
        limit: adapter?.charLimit ?? 0,
        available: adapter !== undefined,
      };
    })
    .sort((left, right) => {
      const leftOrder = registry[left.id]?.popupOrder ?? Number.MAX_SAFE_INTEGER;
      const rightOrder = registry[right.id]?.popupOrder ?? Number.MAX_SAFE_INTEGER;
      return leftOrder - rightOrder
        || (sourceOrder.get(left.id) ?? 0) - (sourceOrder.get(right.id) ?? 0);
    });

  const defaultSelected = Object.fromEntries(
    ids.map((id) => [id, registry[id]?.defaultSelected === true]),
  ) as Record<PlatformId, boolean>;

  return { platforms, defaultSelected };
}

const popupPlatformConfig = buildPopupPlatformConfig(adapters);

export const POPUP_PLATFORMS: PlatformOption[] = popupPlatformConfig.platforms;
export const DEFAULT_SELECTED_PLATFORMS: Record<PlatformId, boolean> =
  popupPlatformConfig.defaultSelected;

export function resolveTuttiContext(
  pathname: string = location.pathname,
  search: string = location.search,
): 'popup' | 'sidepanel' | 'floating' {
  if (pathname.includes('sidepanel.html')) return 'sidepanel';
  if (new URLSearchParams(search).get('floating') === '1') return 'floating';
  return 'popup';
}
