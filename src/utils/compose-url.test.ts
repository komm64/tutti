import { describe, expect, it } from 'vitest';
import { isKnownComposeUrl } from './compose-url';

describe('isKnownComposeUrl', () => {
  it('recognizes URL-prefill compose routes used in issue diagnostics', () => {
    expect(isKnownComposeUrl('bluesky', 'https://bsky.app/intent/compose?text=hi')).toBe(true);
    expect(isKnownComposeUrl('threads', 'https://www.threads.com/intent/post?text=hi')).toBe(true);
    expect(isKnownComposeUrl('misskey', 'https://misskey.io/share?text=hi')).toBe(true);
  });

  it('does not treat ordinary browsing pages as compose routes', () => {
    expect(isKnownComposeUrl('bluesky', 'https://bsky.app/profile/alice')).toBe(false);
    expect(isKnownComposeUrl('threads', 'https://www.threads.com/@alice')).toBe(false);
    expect(isKnownComposeUrl('misskey', 'https://misskey.io/notes/abc')).toBe(false);
  });
});
