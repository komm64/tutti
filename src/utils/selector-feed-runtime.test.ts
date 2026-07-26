import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fetchOverridesFrom,
  getSelectorFeedDiagnostics,
} from './selector-feed-runtime';
import {
  getOverrides,
  getVideoConstraintsOverrides,
  resolveSelectors,
} from './selector-overrides';

const validMetadata = {
  schemaVersion: 1,
  description: 'Tutti selector feed',
  homepage: 'https://github.com/komm64/tutti',
};

describe('selector override feed runtime contract', () => {
  let store: Record<string, unknown>;

  beforeEach(() => {
    store = {
      selectorOverrides: {
        x: { textarea: '.stale-selector' },
      },
      selectorOverridesFetchedAt: 123,
      videoConstraintsOverrides: {
        bluesky: { maxBytes: 1 },
      },
    };
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
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('atomically stores a supported schema-v1 feed', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({
      _meta: validMetadata,
      x: { textarea: '[data-testid="tweetTextarea_0"]' },
      _videoConstraints: {
        bluesky: { maxBytes: 200_000_000 },
      },
    })));

    const result = await fetchOverridesFrom('https://example.com/selectors.json');

    expect(result).toEqual({ ok: true, count: 1 });
    expect(await getOverrides()).toEqual({
      x: { textarea: '[data-testid="tweetTextarea_0"]' },
    });
    expect(await getVideoConstraintsOverrides()).toEqual({
      bluesky: { maxBytes: 200_000_000 },
    });
    expect(await getSelectorFeedDiagnostics()).toEqual({
      status: 'applied',
      reason: 'applied',
      checkedAt: expect.any(Number),
      schemaVersion: 1,
    });
    expect(store.selectorOverridesFetchedAt).not.toBe(123);
  });

  it('applies known entries and records sanitized additive unknown-entry warnings', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({
      _meta: validMetadata,
      x: {
        textarea: 'textarea',
        futureSelector: '[data-future]',
        '<private>': 'ignored',
      },
      futureNetwork: {
        textarea: 'textarea',
      },
    })));

    const result = await fetchOverridesFrom('https://example.com/selectors.json');

    expect(result).toMatchObject({
      ok: true,
      count: 1,
      warnings: [
        'x.futureSelector: unknown schema-v1 selector wire key',
        '<invalid feed entry>',
        'futureNetwork: unknown platform',
      ],
    });
    expect(await getOverrides()).toEqual({
      x: { textarea: 'textarea' },
    });
    expect(await getSelectorFeedDiagnostics()).toEqual({
      status: 'applied',
      reason: 'applied-with-unknown-entries',
      checkedAt: expect.any(Number),
      schemaVersion: 1,
      unknownEntries: [
        'x.futureSelector: unknown schema-v1 selector wire key',
        '<invalid feed entry>',
        'futureNetwork: unknown platform',
      ],
    });
  });

  it('clears stale caches and uses bundled defaults for unsupported schemas', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({
      _meta: { ...validMetadata, schemaVersion: 2 },
      x: { textarea: '.remote-selector' },
    })));

    const result = await fetchOverridesFrom('https://example.com/selectors.json');

    expect(result).toEqual({
      ok: false,
      error: '_meta.schemaVersion: unsupported schema 2; expected 1',
    });
    expect(await getOverrides()).toEqual({});
    expect(await getVideoConstraintsOverrides()).toEqual({});
    expect(store.selectorOverridesFetchedAt).toBeNull();
    await expect(resolveSelectors('x', {
      textarea: '.bundled-selector',
    })).resolves.toEqual({
      textarea: '.bundled-selector',
    });
    expect(await getSelectorFeedDiagnostics()).toEqual({
      status: 'fallback',
      reason: 'unsupported-schema',
      checkedAt: expect.any(Number),
      schemaVersion: 2,
    });
  });

  it('rejects malformed known entries instead of partially applying the feed', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({
      _meta: validMetadata,
      x: {
        textarea: 42,
        postButton: '[data-testid="tweetButton"]',
      },
    })));

    const result = await fetchOverridesFrom('https://example.com/selectors.json');

    expect(result).toEqual({
      ok: false,
      error: 'x.textarea: selector must be a non-empty string',
    });
    expect(await getOverrides()).toEqual({});
    expect(await getSelectorFeedDiagnostics()).toEqual({
      status: 'fallback',
      reason: 'invalid-feed',
      checkedAt: expect.any(Number),
      schemaVersion: 1,
    });
  });

  it.each([
    {
      name: 'HTTP failure',
      fetchImpl: async () => jsonResponse({}, 503),
      reason: 'http-error',
      error: 'HTTP 503',
      diagnostic: { httpStatus: 503 },
    },
    {
      name: 'invalid JSON',
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        json: vi.fn(async () => {
          throw new SyntaxError('invalid JSON');
        }),
      } as unknown as Response),
      reason: 'invalid-json',
      error: 'invalid JSON',
      diagnostic: {},
    },
    {
      name: 'network failure',
      fetchImpl: async () => {
        throw new TypeError('network unavailable');
      },
      reason: 'network-error',
      error: 'network unavailable',
      diagnostic: {},
    },
  ])('clears stale caches on $name', async ({
    fetchImpl,
    reason,
    error,
    diagnostic,
  }) => {
    vi.stubGlobal('fetch', vi.fn(fetchImpl));

    await expect(fetchOverridesFrom('https://example.com/selectors.json'))
      .resolves.toEqual({ ok: false, error });
    expect(await getOverrides()).toEqual({});
    expect(await getVideoConstraintsOverrides()).toEqual({});
    expect(store.selectorOverridesFetchedAt).toBeNull();
    expect(await getSelectorFeedDiagnostics()).toEqual({
      status: 'fallback',
      reason,
      checkedAt: expect.any(Number),
      ...diagnostic,
    });
  });
});

function jsonResponse(value: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn(async () => value),
  } as unknown as Response;
}
