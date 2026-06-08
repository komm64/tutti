import { describe, expect, it } from 'vitest';
import { buildReplyOverrideUrl } from './platform-poster';

describe('platform poster helpers', () => {
  it('builds X reply intent URLs from previous post URLs', () => {
    expect(buildReplyOverrideUrl('x', 1, 'https://x.com/alice/status/123456')).toBe(
      'https://x.com/intent/post?in_reply_to=123456',
    );
  });

  it('does not build reply URLs outside X continuation chunks', () => {
    expect(buildReplyOverrideUrl('x', 0, 'https://x.com/alice/status/123456')).toBeUndefined();
    expect(buildReplyOverrideUrl('bluesky', 1, 'https://bsky.app/profile/alice/post/abc')).toBeUndefined();
    expect(buildReplyOverrideUrl('x', 1, 'https://x.com/home')).toBeUndefined();
  });
});
