import { beforeEach, describe, expect, it, vi } from 'vitest';
import { postViaApi as postBlueskyApi } from '../api/bluesky';
import { postViaApi as postMastodonApi } from '../api/mastodon';
import { getApiCredentials } from '../utils/api-credentials';
import { tryApiPath } from './api-posting';

vi.mock('../api/bluesky', () => ({
  postViaApi: vi.fn(async () => ({ success: true, postUrl: 'https://bsky.app/profile/alice/post/abc' })),
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
  const postMastodon = vi.mocked(postMastodonApi);

  beforeEach(() => {
    vi.clearAllMocks();
    getCreds.mockResolvedValue({
      bluesky: { identifier: 'alice.test', appPassword: 'xxxx-xxxx-xxxx-xxxx' },
    });
  });

  it('bypasses the Bluesky API path for video attachments', async () => {
    const result = await tryApiPath('bluesky', 'hello', [{
      name: 'clip.mp4',
      type: 'video/mp4',
      data: 'AA==',
      durationS: 1,
    }]);

    expect(result).toBe('no-credentials');
    expect(postBluesky).not.toHaveBeenCalled();
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
