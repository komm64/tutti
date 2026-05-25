import { describe, expect, it } from 'vitest';
import { extractPollingTarget, isPollingSupported } from './interaction-poll';

describe('extractPollingTarget', () => {
  it('extracts Bluesky handle + tid from web URL', () => {
    const t = extractPollingTarget('bluesky', 'https://bsky.app/profile/ren-fujimoto89.bsky.social/post/3mmm6x4gr422w');
    expect(t).toEqual({ bluesky: { handle: 'ren-fujimoto89.bsky.social', tid: '3mmm6x4gr422w' } });
  });

  it('extracts Mastodon instance + status ID', () => {
    const t = extractPollingTarget('mastodon', 'https://mastodon.social/@ren_fujimoto/116630030990336659');
    expect(t).toEqual({ mastodon: { instanceHost: 'mastodon.social', statusId: '116630030990336659' } });
  });

  it('extracts Misskey instance + note ID', () => {
    const t = extractPollingTarget('misskey', 'https://misskey.io/notes/amngb68fg38u03lf');
    expect(t).toEqual({ misskey: { instanceHost: 'misskey.io', noteId: 'amngb68fg38u03lf' } });
  });

  it('returns null for unsupported platform', () => {
    expect(extractPollingTarget('x', 'https://x.com/user/status/123')).toBeNull();
  });

  it('returns null for malformed URL', () => {
    expect(extractPollingTarget('bluesky', 'https://bsky.app/notarealpath')).toBeNull();
  });
});

describe('isPollingSupported', () => {
  it('returns true for the 3 A-plan SNS', () => {
    expect(isPollingSupported('bluesky')).toBe(true);
    expect(isPollingSupported('mastodon')).toBe(true);
    expect(isPollingSupported('misskey')).toBe(true);
  });
  it('returns false for everything else', () => {
    for (const p of ['x', 'threads', 'tumblr', 'pixiv', 'deviantart', 'instagram', 'tiktok', 'youtube'] as const) {
      expect(isPollingSupported(p)).toBe(false);
    }
  });
});
