import { afterEach, describe, expect, it, vi } from 'vitest';
import { waitForWebActionPacing } from '../utils/web-action-pacing';
import { openOrFocusTab } from './tab-management';

vi.mock('../utils/web-action-pacing', () => ({
  waitForWebActionPacing: vi.fn(async () => 0),
}));

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
    expect(waitForWebActionPacing).toHaveBeenCalledWith('navigation');
    expect(vi.mocked(waitForWebActionPacing).mock.invocationCallOrder[0]).toBeLessThan(
      create.mock.invocationCallOrder[0]!,
    );
    expect(query).not.toHaveBeenCalled();
    expect(create).toHaveBeenCalledWith({ url: 'https://x.com/compose/post', active: false });
    expect(update).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  });

  it('retries transient Chrome tab locks when navigating an existing tab', async () => {
    const composeUrl = 'https://x.com/compose/post?text=hello';
    const readyTab = { id: 1, url: composeUrl, status: 'complete', windowId: 10 };
    const query = vi.fn(async () => [
      { id: 1, url: 'https://x.com/home', status: 'complete', windowId: 10 },
    ]);
    const create = vi.fn();
    const update = vi.fn()
      .mockRejectedValueOnce(new Error('Tabs cannot be edited right now (user may be dragging a tab).'))
      .mockResolvedValue(readyTab);
    const reload = vi.fn();

    vi.stubGlobal('browser', {
      tabs: {
        query,
        create,
        update,
        reload,
        get: vi.fn(async () => readyTab),
        onUpdated: {
          addListener: vi.fn(),
          removeListener: vi.fn(),
        },
      },
      scripting: {
        executeScript: vi.fn(async () => [{ result: true }]),
      },
    });

    const result = await openOrFocusTab(
      composeUrl,
      (url) => url.startsWith('https://x.com/'),
      false,
    );

    expect(result).toEqual({ tab: readyTab, wasCreated: false });
    expect(create).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledTimes(2);
    expect(update).toHaveBeenNthCalledWith(1, 1, { url: composeUrl, active: false });
    expect(update).toHaveBeenNthCalledWith(2, 1, { url: composeUrl, active: false });
    expect(reload).not.toHaveBeenCalled();
  });

  it('keeps an active compose tab visible inside an unfocused posting window', async () => {
    const created = {
      id: 3,
      url: 'https://x.com/compose/post',
      status: 'loading',
      active: true,
      windowId: 41,
    };
    const create = vi.fn(async () => created);
    const updateWindow = vi.fn();

    vi.stubGlobal('browser', {
      tabs: {
        query: vi.fn(async () => []),
        create,
        update: vi.fn(),
        reload: vi.fn(),
        get: vi.fn(async () => ({ ...created, status: 'complete' })),
        onUpdated: {
          addListener: vi.fn((listener: (tabId: number, info: { status?: string }) => void) => {
            queueMicrotask(() => listener(3, { status: 'complete' }));
          }),
          removeListener: vi.fn(),
        },
      },
      windows: {
        update: updateWindow,
      },
      scripting: {
        executeScript: vi.fn(async () => [{ result: true }]),
      },
    });

    const result = await openOrFocusTab(
      'https://x.com/compose/post',
      (url) => url.startsWith('https://x.com/'),
      true,
      {
        reuseExistingTab: false,
        targetWindowId: 41,
        focusWindow: false,
        restoreFocusWindowId: 7,
      },
    );

    expect(result).toEqual({ tab: created, wasCreated: true });
    expect(create).toHaveBeenCalledWith({
      url: 'https://x.com/compose/post',
      active: true,
      windowId: 41,
    });
    expect(updateWindow).toHaveBeenCalledWith(7, { focused: true });
  });
});
