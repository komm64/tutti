import { afterEach, describe, expect, it, vi } from 'vitest';
import { openOrFocusTab } from './tab-management';

describe('openOrFocusTab reuseExistingTab option', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('creates a new tab when existing tab reuse is disabled', async () => {
    const created = { id: 2, url: 'https://x.com/compose/post', status: 'loading' };
    const create = vi.fn(async () => created);
    const query = vi.fn(async () => [
      { id: 1, url: 'https://x.com/compose/post', status: 'complete' },
    ]);
    const update = vi.fn();
    const reload = vi.fn();

    vi.stubGlobal('browser', {
      tabs: {
        query,
        create,
        update,
        reload,
        get: vi.fn(async () => ({ ...created, status: 'complete' })),
        onUpdated: {
          addListener: vi.fn((listener: (tabId: number, info: { status?: string }) => void) => {
            queueMicrotask(() => listener(2, { status: 'complete' }));
          }),
          removeListener: vi.fn(),
        },
      },
      scripting: {
        executeScript: vi.fn(async () => [{ result: true }]),
      },
    });

    const result = await openOrFocusTab(
      'https://x.com/compose/post',
      (url) => url.startsWith('https://x.com/'),
      false,
      { reuseExistingTab: false },
    );

    expect(result).toEqual({ tab: created, wasCreated: true });
    expect(query).not.toHaveBeenCalled();
    expect(create).toHaveBeenCalledWith({ url: 'https://x.com/compose/post', active: false });
    expect(update).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  });
});
