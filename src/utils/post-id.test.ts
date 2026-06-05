import { describe, expect, it } from 'vitest';
import { extractPostId } from './post-id';

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
