import { afterEach, describe, expect, it, vi } from 'vitest';
import { captureMastodonPostViaPublicApi } from './post-url-mastodon-api';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Mastodon public API post URL capture', () => {
  it('resolves the local account and matches normalized status text', async () => {
    vi.stubGlobal('browser', {
      tabs: {
        get: vi.fn(async () => ({
          url: 'https://social.example/home',
        })),
      },
    });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(
        JSON.stringify({ id: 'account-42' }),
        { status: 200 },
      ))
      .mockResolvedValueOnce(new Response(
        JSON.stringify([{
          url: 'https://social.example/@alice/123',
          content: '<p>Hello &amp; welcome<br>from Tutti</p>',
        }]),
        { status: 200 },
      ));
    vi.stubGlobal('fetch', fetchMock);
    const debug = vi.fn();

    await expect(captureMastodonPostViaPublicApi(
      42,
      'Hello & welcome from Tutti',
      '@alice',
      debug,
    )).resolves.toBe('https://social.example/@alice/123');

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://social.example/api/v1/accounts/lookup?acct=alice',
      { cache: 'no-store' },
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://social.example/api/v1/accounts/account-42/' +
      'statuses?limit=10&exclude_replies=false&exclude_reblogs=true',
      { cache: 'no-store' },
    );
  });

  it('uses the federated account domain instead of the compose tab instance', async () => {
    vi.stubGlobal('browser', {
      tabs: {
        get: vi.fn(async () => ({
          url: 'https://local.example/home',
        })),
      },
    });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(
        JSON.stringify({ id: 'remote-42' }),
        { status: 200 },
      ))
      .mockResolvedValueOnce(new Response(
        JSON.stringify([{
          uri: 'https://remote.example/users/alice/statuses/456',
          content: '<p>Federated hello</p>',
        }]),
        { status: 200 },
      ));
    vi.stubGlobal('fetch', fetchMock);

    await expect(captureMastodonPostViaPublicApi(
      42,
      'Federated hello',
      '@alice@remote.example',
      vi.fn(),
    )).resolves.toBe('https://remote.example/users/alice/statuses/456');

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'https://remote.example/api/v1/accounts/lookup?acct=alice',
    );
  });
});
