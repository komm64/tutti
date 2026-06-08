import { describe, expect, it } from 'vitest';
import { isTabAtExpectedComposeUrl } from './tab-management';

describe('isTabAtExpectedComposeUrl', () => {
  it('accepts the exact compose URL', () => {
    expect(isTabAtExpectedComposeUrl(
      'https://mastodon.social/share?text=hello',
      'https://mastodon.social/share?text=hello',
    )).toBe(true);
  });

  it('accepts the same compose route when the SNS normalizes query params', () => {
    expect(isTabAtExpectedComposeUrl(
      'https://mastodon.social/share?text=hello+world',
      'https://mastodon.social/share?text=hello%20world',
      true,
    )).toBe(true);
  });

  it('accepts the same compose route after the SNS consumes the query', () => {
    expect(isTabAtExpectedComposeUrl(
      'https://mastodon.social/share',
      'https://mastodon.social/share?text=hello',
      true,
    )).toBe(true);
  });

  it('requires the exact URL unless relaxed compose matching is enabled', () => {
    expect(isTabAtExpectedComposeUrl(
      'https://mastodon.social/share?text=old',
      'https://mastodon.social/share?text=new',
    )).toBe(false);
  });

  it('rejects a different route or origin', () => {
    expect(isTabAtExpectedComposeUrl(
      'https://mastodon.social/home',
      'https://mastodon.social/share?text=hello',
      true,
    )).toBe(false);
    expect(isTabAtExpectedComposeUrl(
      'https://example.com/share?text=hello',
      'https://mastodon.social/share?text=hello',
      true,
    )).toBe(false);
  });
});
