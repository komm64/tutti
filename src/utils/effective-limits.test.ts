import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getEffectiveVideoConstraints } from './effective-limits';

const mocks = vi.hoisted(() => ({
  getApiCredentials: vi.fn(),
  getSettings: vi.fn(),
  getVideoConstraintsOverrides: vi.fn(),
  probeBluesky: vi.fn(),
  probeMastodon: vi.fn(),
  probeMisskey: vi.fn(),
}));

vi.mock('./api-credentials', () => ({
  getApiCredentials: mocks.getApiCredentials,
}));

vi.mock('../storage', () => ({
  getSettings: mocks.getSettings,
}));

vi.mock('./selector-overrides', () => ({
  getVideoConstraintsOverrides: mocks.getVideoConstraintsOverrides,
}));

vi.mock('../api/limits-probe', () => ({
  probeBluesky: mocks.probeBluesky,
  probeMastodon: mocks.probeMastodon,
  probeMisskey: mocks.probeMisskey,
}));

describe('getEffectiveVideoConstraints', () => {
  let store: Record<string, unknown>;

  beforeEach(() => {
    store = {};
    vi.stubGlobal('browser', {
      storage: {
        local: {
          get: vi.fn(async (key: string) => ({ [key]: store[key] })),
          set: vi.fn(async (values: Record<string, unknown>) => {
            Object.assign(store, values);
          }),
        },
      },
    });
    mocks.getApiCredentials.mockResolvedValue({});
    mocks.getSettings.mockResolvedValue({ mastodonInstance: 'https://mastodon.social' });
    mocks.getVideoConstraintsOverrides.mockResolvedValue({});
    mocks.probeMastodon.mockResolvedValue({
      fetchedAt: Date.now(),
      maxBytes: 103_809_024,
      maxDurationS: 0,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('probes Mastodon instance limits even without stored API credentials', async () => {
    const result = await getEffectiveVideoConstraints('mastodon', {
      maxBytes: 40 * 1024 * 1024,
      maxDurationS: 0,
    });

    expect(mocks.probeMastodon).toHaveBeenCalledWith({
      instance: 'https://mastodon.social',
      accessToken: '',
    });
    expect(result.maxBytes).toBe(103_809_024);
  });
});
