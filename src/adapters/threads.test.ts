import { describe, expect, it } from 'vitest';
import { THREADS_SELECTORS, threadsAdapter } from './threads';

describe('Threads adapter compose flow', () => {
  it('opens the authenticated home composer without putting text in the URL', () => {
    const text = 'emoji 😀 🧑‍💻 ❤️‍🔥 日本語';
    const composeUrl = threadsAdapter.getComposeUrl(text);

    expect(composeUrl).toBe('https://www.threads.com/');
    expect(composeUrl).not.toContain(encodeURIComponent(text));
    expect(threadsAdapter.prefillsViaUrl).toBe(false);
  });

  it('targets only the visible composer dialog editor, not the feed trigger behind it', () => {
    expect(THREADS_SELECTORS.textarea).toContain('[role="dialog"]');
    expect(THREADS_SELECTORS.textarea).not.toMatch(/(?:^|,)\s*div\[contenteditable/);
  });
});
