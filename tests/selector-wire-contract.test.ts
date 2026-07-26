import { describe, expect, it } from 'vitest';
import selectorWireContractV1 from '../src/adapters/selector-wire-contract-v1.json';
import { BLUESKY_SELECTORS } from '../src/adapters/bluesky';
import { DEVIANTART_SELECTORS } from '../src/adapters/deviantart';
import { INSTAGRAM_SELECTORS } from '../src/adapters/instagram';
import { MASTODON_SELECTORS } from '../src/adapters/mastodon';
import { MISSKEY_SELECTORS } from '../src/adapters/misskey';
import { PIXIV_SELECTORS } from '../src/adapters/pixiv';
import { THREADS_SELECTORS } from '../src/adapters/threads';
import { TIKTOK_SELECTORS } from '../src/adapters/tiktok';
import { TUMBLR_SELECTORS } from '../src/adapters/tumblr';
import { X_SELECTORS } from '../src/adapters/x';
import { YOUTUBE_SELECTORS } from '../src/adapters/youtube';

const currentSelectorKeys = {
  bluesky: Object.keys(BLUESKY_SELECTORS).sort(),
  deviantart: Object.keys(DEVIANTART_SELECTORS).sort(),
  instagram: Object.keys(INSTAGRAM_SELECTORS).sort(),
  mastodon: Object.keys(MASTODON_SELECTORS).sort(),
  misskey: Object.keys(MISSKEY_SELECTORS).sort(),
  pixiv: Object.keys(PIXIV_SELECTORS).sort(),
  threads: Object.keys(THREADS_SELECTORS).sort(),
  tiktok: Object.keys(TIKTOK_SELECTORS).sort(),
  tumblr: Object.keys(TUMBLR_SELECTORS).sort(),
  x: Object.keys(X_SELECTORS).sort(),
  youtube: Object.keys(YOUTUBE_SELECTORS).sort(),
};

describe('selector schema-v1 wire contract', () => {
  it('freezes every currently published selector key as a persistent wire ID', () => {
    expect(selectorWireContractV1).toEqual({
      schemaVersion: 1,
      platforms: currentSelectorKeys,
    });
  });
});
