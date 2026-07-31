import { describe, expect, it } from 'vitest';
import { xAdapter } from './x';

describe('X adapter compose URL', () => {
  it('uses X intent prefill so the controlled editor owns non-empty text', () => {
    expect(xAdapter.getComposeUrl('hello #tutti')).toBe(
      'https://x.com/intent/post?text=hello%20%23tutti',
    );
  });

  it('uses the plain compose route for media-only posts', () => {
    expect(xAdapter.getComposeUrl('')).toBe('https://x.com/compose/post');
  });
});
