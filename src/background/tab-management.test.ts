import { afterEach, describe, expect, it, vi } from 'vitest';
import { summarizeResults } from './post-status-ui';
import { closeTabSafely } from './tab-management';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('summarizeResults', () => {
  it('keeps uncertain posts separate from confirmed failures', () => {
    expect(summarizeResults([
      { success: true },
      { success: false, uncertain: true },
      { success: false },
    ])).toEqual({
      succeeded: 1,
      uncertain: 1,
      failed: 1,
    });
  });
});

describe('closeTabSafely', () => {
  it('does not block request cleanup when Chromium leaves tabs.remove pending', async () => {
    vi.useFakeTimers();
    const remove = vi.fn(() => new Promise<void>(() => {}));
    vi.stubGlobal('browser', {
      tabs: { remove },
    });

    const closing = closeTabSafely(123);
    await vi.advanceTimersByTimeAsync(2000);

    await expect(closing).resolves.toBeUndefined();
    expect(remove).toHaveBeenCalledWith(123);
  });
});
