import { describe, expect, it } from 'vitest';
import { buildPostIds } from './history-recorder';

describe('buildPostIds', () => {
  it('extracts platform post IDs from successful URLs', () => {
    expect(buildPostIds([
      {
        type: 'POST_RESULT',
        platform: 'x',
        success: true,
        url: 'https://x.com/alice/status/123456789',
      },
      {
        type: 'POST_RESULT',
        platform: 'mastodon',
        success: true,
        url: 'https://mastodon.social/@alice/999',
      },
    ])).toEqual({
      x: '123456789',
      mastodon: '999',
    });
  });

  it('skips results without extractable IDs', () => {
    expect(buildPostIds([
      {
        type: 'POST_RESULT',
        platform: 'threads',
        success: false,
        error: 'failed',
      },
    ])).toEqual({});
  });

  it('does not extract IDs from preview results', () => {
    expect(buildPostIds([
      {
        type: 'POST_RESULT',
        platform: 'x',
        success: true,
        preview: true,
        url: 'https://x.com/alice/status/123456789',
      },
    ])).toEqual({});
  });
});
