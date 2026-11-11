import { describe, expect, it } from 'vitest';
import { pickTikTokStudioVideoUrl, tiktokVideoCreatedAtMs } from './post-url-tiktok-studio';

// Real IDs from the Surface test account's Studio post list.
const OCT_28 = '7701846621562146055';
const JUL_28 = '7667641946600508693';

function link(id: string, text: string) {
  return { href: `https://www.tiktok.com/@tester/video/${id}`, text };
}

describe('tiktokVideoCreatedAtMs', () => {
  it('reads the creation time from the top 32 bits of the video ID', () => {
    expect(new Date(tiktokVideoCreatedAtMs(OCT_28)!).toISOString().slice(0, 10)).toBe('2026-10-28');
    expect(new Date(tiktokVideoCreatedAtMs(JUL_28)!).toISOString().slice(0, 10)).toBe('2026-07-28');
  });

  it('rejects values that are not video IDs', () => {
    expect(tiktokVideoCreatedAtMs('abc')).toBeNull();
    expect(tiktokVideoCreatedAtMs('123')).toBeNull();
  });
});

describe('pickTikTokStudioVideoUrl', () => {
  const postedAt = tiktokVideoCreatedAtMs(OCT_28)! - 30_000;

  it('returns the post created after the start whose caption matches', () => {
    expect(pickTikTokStudioVideoUrl(
      [link(OCT_28, 'tutti surface matrix video 2026-10-28T22'), link(JUL_28, 'tutti surface matrix video 2026-07-28T18')],
      'tutti surface matrix video 2026-10-28T22:10',
      postedAt,
    )).toBe(`https://www.tiktok.com/@tester/video/${OCT_28}`);
  });

  it('never returns an older post while the new one is still processing', () => {
    expect(pickTikTokStudioVideoUrl(
      [link(JUL_28, 'tutti surface matrix video 2026-07-28T18')],
      'tutti surface matrix video 2026-07-28T18',
      postedAt,
    )).toBeUndefined();
  });

  it('skips a new post with a different caption', () => {
    expect(pickTikTokStudioVideoUrl(
      [link(OCT_28, 'someone else posted this')],
      'tutti surface matrix video',
      postedAt,
    )).toBeUndefined();
  });

  it('accepts a captionless post by creation time alone', () => {
    expect(pickTikTokStudioVideoUrl([link(OCT_28, '​')], '', postedAt))
      .toBe(`https://www.tiktok.com/@tester/video/${OCT_28}`);
  });

  it('returns nothing without a caption or a start time to tell posts apart', () => {
    expect(pickTikTokStudioVideoUrl([link(OCT_28, 'x')], '', undefined)).toBeUndefined();
  });

  it('resolves relative Studio links', () => {
    expect(pickTikTokStudioVideoUrl(
      [{ href: `/@tester/video/${OCT_28}`, text: 'hello world' }],
      'hello world',
      postedAt,
    )).toBe(`https://www.tiktok.com/@tester/video/${OCT_28}`);
  });
});
