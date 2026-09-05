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

  it('does not accept an unrelated rendered feed link as evidence', () => {
    const input = {
      currentPostUrl: undefined,
      renderedPostUrl: 'https://www.threads.com/@other/post/stale',
    };

    expect(resolveThreadsPostEvidenceUrl(input)).toBeUndefined();
  });
});
