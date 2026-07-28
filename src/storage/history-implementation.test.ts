import { afterEach, describe, expect, it, vi } from 'vitest';
import { addToPostHistory } from './history';

describe('history implementation diagnostics', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('persists the selected implementation path and revision per platform', async () => {
    let storedHistory: unknown[] = [];
    const set = vi.fn(async (values: Record<string, unknown>) => {
      storedHistory = values['postHistory'] as unknown[];
    });
    vi.stubGlobal('browser', {
      storage: {
        local: {
          get: vi.fn(async () => ({ postHistory: storedHistory })),
          set,
        },
      },
    });

    await addToPostHistory('diagnostic post', [{
      type: 'POST_RESULT',
      platform: 'x',
      success: true,
      confirmed: true,
      implementation: {
        revision: 1,
        path: 'next',
      },
      url: 'https://x.com/example/status/1',
    }], false);

    expect(set).toHaveBeenCalledOnce();
    expect(storedHistory).toEqual([
      expect.objectContaining({
        results: {
          x: expect.objectContaining({
            implementation: {
              revision: 1,
              path: 'next',
            },
          }),
        },
      }),
    ]);
  });
});
