import { afterEach, describe, expect, it, vi } from 'vitest';
import customSettingsFixture from './fixtures/storage/custom-settings.json';
import currentHistoryFixture from './fixtures/storage/current-history.json';
import legacyHistoryFixture from './fixtures/storage/legacy-history.json';
import legacyLastSeenUsersFixture from './fixtures/storage/legacy-last-seen-users.json';
import legacyPagesSettingsFixture from './fixtures/storage/legacy-pages-settings.json';
import legacySettingsFixture from './fixtures/storage/legacy-settings.json';
import {
  getLastSeenUsers,
  getPostHistory,
  getSettings,
} from './storage';

const CURRENT_SELECTOR_FEED_URL = 'https://tutti.komm64.com/selectors.json';

function stubStorage(options: {
  sync?: Record<string, unknown>;
  local?: Record<string, unknown>;
}): {
  localSet: ReturnType<typeof vi.fn>;
} {
  const localSet = vi.fn(async () => undefined);
  vi.stubGlobal('browser', {
    storage: {
      sync: {
        get: vi.fn(async () => options.sync ?? {}),
      },
      local: {
        get: vi.fn(async () => options.local ?? {}),
        set: localSet,
      },
    },
  });
  return { localSet };
}

describe('storage migration fixtures', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('keeps the safe auto-post default and migrates the legacy selector endpoint', async () => {
    stubStorage({ sync: legacySettingsFixture });

    const settings = await getSettings();

    expect(settings).toMatchObject({
      autoPost: false,
      mastodonInstance: 'https://social.example',
      selectorOverrideUrl: CURRENT_SELECTOR_FEED_URL,
      logLevel: 'DEBUG',
      autoOpenPostUrl: 'never',
      uiLanguage: 'auto',
    });
    expect(settings).not.toHaveProperty('dryRun');
  });

  it('preserves explicit current settings and custom selector endpoints', async () => {
    stubStorage({ sync: customSettingsFixture });

    await expect(getSettings()).resolves.toMatchObject({
      autoPost: true,
      selectorOverrideUrl: 'https://selectors.example/custom.json',
      uiLanguage: 'ja',
    });
  });

  it('also migrates the retired Cloudflare Pages selector endpoint', async () => {
    stubStorage({ sync: legacyPagesSettingsFixture });

    await expect(getSettings()).resolves.toMatchObject({
      selectorOverrideUrl: CURRENT_SELECTOR_FEED_URL,
    });
  });

  it('drops retired posting implementation selectors', async () => {
    stubStorage({
      sync: {
        settings: {
          xThreadPostingMode: 'sequential',
        },
      },
    });
    await expect(getSettings()).resolves.not.toHaveProperty('xThreadPostingMode');

    stubStorage({
      sync: {
        settings: {
          postingAlgorithm: 'next',
          xThreadPostingMode: 'sequential',
        },
      },
    });
    await expect(getSettings()).resolves.not.toHaveProperty('postingAlgorithm');

    stubStorage({
      sync: {
        settings: {
          postingAlgorithm: 'unknown',
          xThreadPostingMode: 'unknown',
        },
      },
    });
    await expect(getSettings()).resolves.not.toHaveProperty('postingAlgorithm');
  });

  it('converts legacy boolean history results through the public reader', async () => {
    stubStorage({ local: legacyHistoryFixture });

    await expect(getPostHistory()).resolves.toEqual([
      {
        ...legacyHistoryFixture.postHistory[0],
        results: {
          x: { success: true },
          bluesky: { success: false },
        },
      },
    ]);
  });

  it('preserves current history payloads and unknown additive fields', async () => {
    stubStorage({ local: currentHistoryFixture });

    await expect(getPostHistory()).resolves.toEqual(currentHistoryFixture.postHistory);
  });

  it('filters reserved usernames and lazily writes the cleaned payload', async () => {
    const { localSet } = stubStorage({ local: legacyLastSeenUsersFixture });

    await expect(getLastSeenUsers()).resolves.toEqual({
      bluesky: 'alice.test',
      mastodon: '@alice@social.example',
    });
    expect(localSet).toHaveBeenCalledOnce();
    expect(localSet).toHaveBeenCalledWith({
      lastSeenUsers: {
        bluesky: 'alice.test',
        mastodon: '@alice@social.example',
      },
    });
  });
});
