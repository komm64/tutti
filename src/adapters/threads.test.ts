import { describe, expect, it } from 'vitest';
import { THREADS_SELECTORS, threadsAdapter } from './threads';

describe('Threads adapter compose flow', () => {
  it('does not send text through the intent URL because Threads corrupts non-BMP Unicode', () => {
    const text = 'emoji 😀 🧑‍💻 ❤️‍🔥 日本語';
    const composeUrl = threadsAdapter.getComposeUrl(text);

    expect(composeUrl).toBe('https://www.threads.com/intent/post');
    expect(composeUrl).not.toContain(encodeURIComponent(text));
    expect(threadsAdapter.prefillsViaUrl).toBe(false);
  });

  it('targets only the visible intent dialog editor, not the feed composer behind it', () => {
    expect(THREADS_SELECTORS.textarea).toContain('[role="dialog"]');
    expect(THREADS_SELECTORS.textarea).not.toMatch(/(?:^|,)\s*div\[contenteditable/);
  });
});
