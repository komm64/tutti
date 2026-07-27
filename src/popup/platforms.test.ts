import { describe, expect, it } from 'vitest';
import { adapters } from '../adapters/registry';
import type { PlatformId } from '../types/platform';
import {
  buildPopupPlatformConfig,
  DEFAULT_SELECTED_PLATFORMS,
  POPUP_PLATFORMS,
  resolveTuttiContext,
} from './platforms';

describe('resolveTuttiContext', () => {
  it('detects sidepanel, floating, and popup contexts', () => {
    expect(resolveTuttiContext('/sidepanel.html', '')).toBe('sidepanel');
    expect(resolveTuttiContext('/popup.html', '?floating=1')).toBe('floating');
    expect(resolveTuttiContext('/popup.html', '')).toBe('popup');
  });
});

describe('popup platform defaults', () => {
  const expectedOrder: PlatformId[] = [
    'x',
    'bluesky',
    'threads',
    'tumblr',
    'mastodon',
    'misskey',
    'pixiv',
    'deviantart',
    'instagram',
    'tiktok',
    'youtube',
  ];

  it('has a selected flag for every platform', () => {
    expect(Object.keys(DEFAULT_SELECTED_PLATFORMS).sort()).toEqual(POPUP_PLATFORMS.map((p) => p.id).sort());
  });

  it('derives the current display order and defaults from adapter metadata', () => {
    expect(POPUP_PLATFORMS.map(({ id }) => id)).toEqual(expectedOrder);
    expect(DEFAULT_SELECTED_PLATFORMS).toEqual({
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
    });
  });

  it('uses adapter names and character limits without popup-local copies', () => {
    for (const option of POPUP_PLATFORMS) {
      expect(option).toMatchObject({
        name: adapters[option.id]?.name,
        limit: adapters[option.id]?.charLimit,
        available: true,
      });
    }
  });

  it('has complete and unique popup order metadata', () => {
    const registeredAdapters = Object.values(adapters).filter((adapter) => adapter !== undefined);
    const orders = registeredAdapters.map(({ popupOrder }) => popupOrder);

    expect(registeredAdapters).toHaveLength(expectedOrder.length);
    expect(new Set(orders).size).toBe(orders.length);
    expect(orders.every(Number.isFinite)).toBe(true);
  });

  it('keeps missing registry entries visible but unavailable and unselected', () => {
    const config = buildPopupPlatformConfig({ ...adapters, youtube: undefined });

    expect(config.platforms.at(-1)).toEqual({
      id: 'youtube',
      name: 'youtube',
      limit: 0,
      available: false,
    });
    expect(config.defaultSelected.youtube).toBe(false);
  });
});
