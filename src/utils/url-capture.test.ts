import { afterEach, describe, expect, it, vi } from 'vitest';
import { waitForPostUrl } from './url-capture';

describe('waitForPostUrl', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns a matching post URL immediately', async () => {
    vi.stubGlobal('location', { href: 'https://example.com/posts/123' });
    await expect(waitForPostUrl([/\/posts\/\d+/], 100, 1))
      .resolves.toBe('https://example.com/posts/123');
  });

  it('returns null immediately when a stop URL is reached', async () => {
    vi.stubGlobal('location', { href: 'https://www.pixiv.net/en/users/123' });
    await expect(waitForPostUrl(
      [/\/artworks\/\d+/],
      1000,
      100,
      [/\/(?:[a-z]+\/)?users\/\d+/],
    )).resolves.toBeNull();
  });
});
