import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  postThreadViaApi as postBlueskyThreadApi,
  postThreadViaSession as postBlueskyThreadSessionApi,
  postViaApi as postBlueskyApi,
  postViaSession as postBlueskySessionApi,
} from '../api/bluesky';
import { postViaApi as postMastodonApi } from '../api/mastodon';
import { getApiCredentials } from '../utils/api-credentials';
import {
  backgroundPlatformStrategies,
  tryApiPath,
  tryApiThreadPath,
} from './platform-strategies';

vi.mock('../api/bluesky', () => ({
  postThreadViaApi: vi.fn(async () => ({ success: true, postUrl: 'https://bsky.app/profile/alice/post/thread-api' })),
  postThreadViaSession: vi.fn(async () => ({ success: true, postUrl: 'https://bsky.app/profile/alice/post/thread-session' })),
  postViaApi: vi.fn(async () => ({ success: true, postUrl: 'https://bsky.app/profile/alice/post/abc' })),
  postViaSession: vi.fn(async () => ({ success: true, postUrl: 'https://bsky.app/profile/alice/post/session-abc' })),
}));

vi.mock('../api/mastodon', () => ({
  postViaApi: vi.fn(async () => ({ success: true })),
}));

vi.mock('../api/misskey', () => ({
  postViaApi: vi.fn(async () => ({ success: true })),
}));

vi.mock('../utils/api-credentials', () => ({
  getApiCredentials: vi.fn(),
}));

describe('tryApiPath', () => {
  const getCreds = vi.mocked(getApiCredentials);
  const postBluesky = vi.mocked(postBlueskyApi);
  const postBlueskySession = vi.mocked(postBlueskySessionApi);
  const postBlueskyThread = vi.mocked(postBlueskyThreadApi);
  const postBlueskyThreadSession = vi.mocked(postBlueskyThreadSessionApi);
  const postMastodon = vi.mocked(postMastodonApi);

  beforeEach(() => {
    vi.clearAllMocks();
    getCreds.mockResolvedValue({
      bluesky: { identifier: 'alice.test', appPassword: 'xxxx-xxxx-xxxx-xxxx' },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('derives API support from strategy membership', () => {
    expect(Object.entries(backgroundPlatformStrategies)
      .filter(([, strategy]) => strategy.apiPost)
      .map(([platform]) => platform)).toEqual(['bluesky', 'mastodon', 'misskey']);
    expect(Object.entries(backgroundPlatformStrategies)
      .filter(([, strategy]) => strategy.apiThreadPost)
      .map(([platform]) => platform)).toEqual(['bluesky']);
  });

  it('returns no-credentials without credential lookup when no API strategy is registered', async () => {
    expect(await tryApiPath('x', 'hello')).toBe('no-credentials');
    expect(getCreds).not.toHaveBeenCalled();
  });

  it('uses the Bluesky API path for video attachments', async () => {
    const result = await tryApiPath('bluesky', 'hello', [{
      name: 'clip.mp4',
      type: 'video/mp4',
      data: 'AA==',
      durationS: 1,
    }]);

    expect(result).toMatchObject({ success: true });
    expect(postBluesky).toHaveBeenCalledWith(
      { identifier: 'alice.test', appPassword: 'xxxx-xxxx-xxxx-xxxx' },
      {
        text: 'hello',
        images: [{
          name: 'clip.mp4',
          type: 'video/mp4',
          data: 'AA==',
          durationS: 1,
        }],
      },
    );
  });

  it('keeps the Bluesky API path for image attachments', async () => {
    const result = await tryApiPath('bluesky', 'hello', [{
      name: 'photo.png',
      type: 'image/png',
      data: 'AA==',
    }]);

    expect(result).toMatchObject({ success: true });
    expect(postBluesky).toHaveBeenCalledOnce();
  });

  it('uses an open Bluesky web session when API credentials are not saved', async () => {
    getCreds.mockResolvedValue({});
    const query = vi.fn(async () => [{ id: 42, url: 'https://bsky.app/profile/alice.test' }]);
    const sendMessage = vi.fn(async () => ({
      type: 'BLUESKY_SESSION_RESULT',
      accessJwt: 'jwt',
      did: 'did:plc:alice',
      handle: 'alice.test',
      pdsHost: 'https://bsky.social',
    }));
    vi.stubGlobal('browser', { tabs: { query, sendMessage } });

    const result = await tryApiPath('bluesky', 'hello', [{
      name: 'clip.mp4',
      type: 'video/mp4',
      data: 'AA==',
      durationS: 1,
    }]);

    expect(result).toMatchObject({ success: true });
    expect(postBluesky).not.toHaveBeenCalled();
    expect(postBlueskySession).toHaveBeenCalledWith(
      {
        accessJwt: 'jwt',
        did: 'did:plc:alice',
        handle: 'alice.test',
        pdsHost: 'https://bsky.social',
      },
      {
        text: 'hello',
        images: [{
          name: 'clip.mp4',
          type: 'video/mp4',
          data: 'AA==',
          durationS: 1,
        }],
      },
    );
  });

  it('posts all Bluesky chunks through one credential-backed API thread call', async () => {
    const result = await tryApiThreadPath(
      'bluesky',
      ['first', 'second'],
      [{ name: 'photo.png', type: 'image/png', data: 'AA==' }],
    );

    expect(result).toMatchObject({ success: true });
    expect(postBlueskyThread).toHaveBeenCalledWith(
      { identifier: 'alice.test', appPassword: 'xxxx-xxxx-xxxx-xxxx' },
      {
        chunks: ['first', 'second'],
        images: [{ name: 'photo.png', type: 'image/png', data: 'AA==' }],
      },
    );
  });

  it('uses a borrowed Bluesky session for API threads without saved credentials', async () => {
    getCreds.mockResolvedValue({});
    vi.stubGlobal('browser', {
      tabs: {
        query: vi.fn(async () => [{ id: 42, url: 'https://bsky.app/profile/alice.test' }]),
        sendMessage: vi.fn(async () => ({
          type: 'BLUESKY_SESSION_RESULT',
          accessJwt: 'jwt',
          did: 'did:plc:alice',
          handle: 'alice.test',
        })),
      },
    });

    const result = await tryApiThreadPath('bluesky', ['first', 'second']);

    expect(result).toMatchObject({ success: true });
    expect(postBlueskyThreadSession).toHaveBeenCalledWith(
      {
        accessJwt: 'jwt',
        did: 'did:plc:alice',
        handle: 'alice.test',
      },
      { chunks: ['first', 'second'], images: undefined },
    );
  });

  it('passes Mastodon continuation reply ids to the API client', async () => {
    getCreds.mockResolvedValue({
      mastodon: { instance: 'https://mastodon.social', accessToken: 'token' },
    });

    const result = await tryApiPath(
      'mastodon',
      'second chunk',
      undefined,
      undefined,
      undefined,
      'https://mastodon.social/@alice/1234567890',
    );

    expect(result).toMatchObject({ success: true });
    expect(postMastodon).toHaveBeenCalledWith(
      { instance: 'https://mastodon.social', accessToken: 'token' },
      expect.objectContaining({
        text: 'second chunk',
        replyToId: '1234567890',
      }),
    );
  });
});
