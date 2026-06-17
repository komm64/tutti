import { describe, expect, it } from 'vitest';
import {
  buildExpectedRenderedProfileUrl,
  isRenderedProfileFallbackPlatform,
} from './post-url-rendered-profile';

describe('rendered profile URL fallback', () => {
  it('matches platforms that can be scraped from their rendered profile page', () => {
    expect(isRenderedProfileFallbackPlatform('x')).toBe(true);
    expect(isRenderedProfileFallbackPlatform('threads')).toBe(true);
    expect(isRenderedProfileFallbackPlatform('tumblr')).toBe(true);
    expect(isRenderedProfileFallbackPlatform('pixiv')).toBe(true);
  });

  it('leaves API-oriented URL capture platforms on the primary path', () => {
    expect(isRenderedProfileFallbackPlatform('mastodon')).toBe(false);
    expect(isRenderedProfileFallbackPlatform('misskey')).toBe(false);
    expect(isRenderedProfileFallbackPlatform('bluesky')).toBe(false);
    expect(isRenderedProfileFallbackPlatform('instagram')).toBe(false);
  });

  it('builds a Tumblr rendered profile URL from the remembered posting user', () => {
    expect(buildExpectedRenderedProfileUrl('tumblr', '@ren-fujimoto')).toBe(
      'https://www.tumblr.com/blog/ren-fujimoto',
    );
    expect(buildExpectedRenderedProfileUrl('tumblr', 'ren-fujimoto.tumblr.com')).toBe(
      'https://www.tumblr.com/blog/ren-fujimoto',
    );
  });
});
