import { describe, expect, it } from 'vitest';
import { resolveThreadsPostEvidenceUrl } from './threads-post-evidence';

describe('Threads post evidence', () => {
  it('ignores the post page that was already open before submission', () => {
    const existing = 'https://www.threads.com/@owner/post/existing';

    expect(resolveThreadsPostEvidenceUrl({
      currentPostUrl: existing,
      preSubmitPostUrl: existing,
    })).toBeUndefined();
  });

  it('accepts a hash-matched API capture when the page does not navigate', () => {
    const captured = 'https://www.threads.com/@owner/post/new-post';

    expect(resolveThreadsPostEvidenceUrl({
      exactCapturedPostUrl: captured,
    })).toBe(captured);
  });

  it('prefers exact capture over navigation or profile evidence', () => {
    const captured = 'https://www.threads.com/@owner/post/actual';
    expect(resolveThreadsPostEvidenceUrl({
      exactCapturedPostUrl: captured,
      currentPostUrl: 'https://www.threads.com/@other/post/unrelated',
      preSubmitProfilePostUrl: 'https://www.threads.com/@owner/post/old',
      currentProfilePostUrl: 'https://www.threads.com/@owner/post/other',
    })).toBe(captured);
  });

  it('does not confirm an existing profile post when the baseline was unavailable', () => {
    expect(resolveThreadsPostEvidenceUrl({
      currentProfilePostUrl: 'https://www.threads.com/@owner/post/existing',
    })).toBeUndefined();
  });

  it.each([undefined, 'https://www.threads.com/@owner/post/old'])(
    'does not confirm a missing or unchanged profile URL (%s)', (currentProfilePostUrl) => {
      expect(resolveThreadsPostEvidenceUrl({
        preSubmitProfilePostUrl: 'https://www.threads.com/@owner/post/old',
        currentProfilePostUrl,
      })).toBeUndefined();
    },
  );

  it('accepts a changed profile URL after a positively observed baseline', () => {
    const url = 'https://www.threads.com/@owner/post/new';
    expect(resolveThreadsPostEvidenceUrl({
      preSubmitProfilePostUrl: 'https://www.threads.com/@owner/post/old',
      currentProfilePostUrl: url,
    })).toBe(url);
  });
});
