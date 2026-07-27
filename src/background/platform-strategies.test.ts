import { describe, expect, it } from 'vitest';
import { adapters } from '../adapters/registry';
import {
  backgroundPlatformStrategies,
  buildExpectedUrlsForVerification,
  buildReplyOverrideUrl,
  canUseApiWithReplyUrl,
  continuationNeedsReplyUrl,
  extractPostId,
  isPostUrlCaptureSupported,
  isVerifySupported,
  resolveComposeUrlForMedia,
  shouldForceInlineThreadPreviewForeground,
  shouldUseInlineThread,
} from './platform-strategies';

describe('background platform strategy registry', () => {
  it('has exactly one post-ID strategy for every adapter', () => {
    expect(Object.keys(backgroundPlatformStrategies).sort()).toEqual(Object.keys(adapters).sort());
    for (const strategy of Object.values(backgroundPlatformStrategies)) {
      expect(strategy.parsePostId).toBeTypeOf('function');
    }
  });

  it('derives continuation support and URLs from strategy membership', () => {
    expect(Object.entries(backgroundPlatformStrategies)
      .filter(([, strategy]) => strategy.continuationUrl)
      .map(([platform]) => platform)).toEqual(['threads', 'mastodon']);
    expect(continuationNeedsReplyUrl('x')).toBe(false);
    expect(continuationNeedsReplyUrl('mastodon')).toBe(true);
    expect(continuationNeedsReplyUrl('threads')).toBe(true);
    expect(continuationNeedsReplyUrl('bluesky')).toBe(false);

    expect(buildReplyOverrideUrl('x', 1, 'https://x.com/alice/status/123456')).toBeUndefined();
    expect(buildReplyOverrideUrl('mastodon', 1, 'https://mastodon.social/@alice/123')).toBe(
      'https://mastodon.social/@alice/123',
    );
    expect(buildReplyOverrideUrl('threads', 1, 'https://www.threads.com/@alice/post/ABC')).toBe(
      'https://www.threads.com/@alice/post/ABC',
    );
    expect(buildReplyOverrideUrl('x', 0, 'https://x.com/alice/status/123456')).toBeUndefined();
    expect(buildReplyOverrideUrl('bluesky', 1, 'https://bsky.app/profile/alice/post/abc')).toBeUndefined();
    expect(buildReplyOverrideUrl('x', 1, 'https://x.com/home')).toBeUndefined();
  });

  it('derives inline thread and API reply continuation policy from strategies', () => {
    expect(shouldUseInlineThread('bluesky', true)).toBe(true);
    expect(shouldUseInlineThread('x', false)).toBe(true);
    expect(shouldUseInlineThread('x', true)).toBe(true);
    expect(shouldUseInlineThread('threads', false)).toBe(false);

    expect(canUseApiWithReplyUrl('mastodon', 'https://mastodon.social/@alice/123')).toBe(true);
    expect(canUseApiWithReplyUrl('mastodon', undefined)).toBe(false);
    expect(canUseApiWithReplyUrl('bluesky', 'https://bsky.app/profile/alice/post/abc')).toBe(false);
  });

  it('derives compose, preview foreground, and verify expectation policy from strategies', () => {
    const video = [{ name: 'clip.mp4', type: 'video/mp4', data: 'AA==' }];
    expect(resolveComposeUrlForMedia('tumblr', 'https://www.tumblr.com/new/text', video))
      .toBe('https://www.tumblr.com/new/video');
    expect(resolveComposeUrlForMedia('x', 'https://x.com/compose/post', video))
      .toBe('https://x.com/compose/post');

    expect(shouldForceInlineThreadPreviewForeground('x', true, ['first', 'second'])).toBe(true);
    expect(shouldForceInlineThreadPreviewForeground('x', false, ['first', 'second'])).toBe(false);
    expect(shouldForceInlineThreadPreviewForeground('bluesky', true, ['first', 'second'])).toBe(false);

    expect(buildExpectedUrlsForVerification('tumblr', 'Try https://tutti.komm64.com/'))
      .toEqual(['https://tutti.komm64.com/']);
    expect(buildExpectedUrlsForVerification('x', 'Try https://tutti.komm64.com/')).toEqual([]);
  });

  it('registers verification for every current platform', () => {
    for (const [platform, strategy] of Object.entries(backgroundPlatformStrategies)) {
      expect(strategy.verifyPost).toBeTypeOf('function');
      expect(isVerifySupported(platform as keyof typeof backgroundPlatformStrategies)).toBe(true);
    }
  });

  it('registers URL capture for every current platform', () => {
    for (const [platform, strategy] of Object.entries(backgroundPlatformStrategies)) {
      expect(strategy.capturePostUrl).toBeTypeOf('function');
      expect(isPostUrlCaptureSupported(platform as keyof typeof backgroundPlatformStrategies)).toBe(true);
    }
  });
});

describe('extractPostId', () => {
  it('extracts X status id', () => {
    expect(extractPostId('x', 'https://x.com/user/status/1234567890')).toBe('1234567890');
    expect(extractPostId('x', 'https://twitter.com/user/status/9876')).toBe('9876');
  });

  it('extracts Bluesky rkey', () => {
    expect(extractPostId('bluesky', 'https://bsky.app/profile/foo.bsky.social/post/abc123XYZ')).toBe('abc123XYZ');
  });

  it('extracts Threads shortcode', () => {
    expect(extractPostId('threads', 'https://www.threads.net/@user/post/C1abc-XYZ_-')).toBe('C1abc-XYZ_-');
  });

  it('extracts Mastodon id (@handle path)', () => {
    expect(extractPostId('mastodon', 'https://mastodon.social/@user/112345678901234567')).toBe('112345678901234567');
  });

  it('extracts Mastodon id (/users/ path)', () => {
    expect(extractPostId('mastodon', 'https://mastodon.social/users/user/statuses/12345')).toBe('12345');
  });

  it('extracts Misskey note id', () => {
    expect(extractPostId('misskey', 'https://misskey.io/notes/9abc12345')).toBe('9abc12345');
  });

  it('extracts Tumblr post id', () => {
    expect(extractPostId('tumblr', 'https://blog.tumblr.com/post/123456789')).toBe('123456789');
    expect(extractPostId('tumblr', 'https://blog.tumblr.com/post/987/slug')).toBe('987');
    expect(extractPostId('tumblr', 'https://www.tumblr.com/ren-fujimoto/818245963998232576/title')).toBe('818245963998232576');
  });

  it('extracts Pixiv illust id', () => {
    expect(extractPostId('pixiv', 'https://www.pixiv.net/artworks/123456')).toBe('123456');
    expect(extractPostId('pixiv', 'https://www.pixiv.net/en/artworks/123456')).toBe('123456');
  });

  it('extracts TikTok video id', () => {
    expect(extractPostId('tiktok', 'https://www.tiktok.com/@user/video/7123456789012345678')).toBe('7123456789012345678');
  });

  it('extracts YouTube video id (watch + shorts + youtu.be)', () => {
    expect(extractPostId('youtube', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(extractPostId('youtube', 'https://youtube.com/shorts/abcDEF_-123')).toBe('abcDEF_-123');
    expect(extractPostId('youtube', 'https://youtu.be/short-id')).toBe('short-id');
  });

  it('extracts Instagram shortcode (p + reel)', () => {
    expect(extractPostId('instagram', 'https://www.instagram.com/p/C1abc-XYZ/')).toBe('C1abc-XYZ');
    expect(extractPostId('instagram', 'https://www.instagram.com/reel/Cxyz123_-/')).toBe('Cxyz123_-');
  });

  it('extracts DeviantArt id from end-numeric url', () => {
    expect(extractPostId('deviantart', 'https://www.deviantart.com/artist/art/title-slug-1234567890')).toBe('1234567890');
    expect(extractPostId('deviantart', 'https://www.deviantart.com/artist/art/1328289647?action=published')).toBe('1328289647');
  });

  it('returns null for malformed / unrelated urls', () => {
    expect(extractPostId('x', 'https://x.com/user')).toBeNull();
    expect(extractPostId('bluesky', '')).toBeNull();
    expect(extractPostId('x', undefined)).toBeNull();
    expect(extractPostId('youtube', 'https://www.youtube.com/')).toBeNull();
  });

  it('returns null for invalid URL strings', () => {
    expect(extractPostId('x', 'not-a-url')).toBeNull();
  });
});
