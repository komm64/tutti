import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createPostingWindowSession,
  handlePostingMediaFocus,
} from './posting-window';

describe('posting window session', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('shares one small window across concurrent DOM posting lanes', async () => {
    const create = vi.fn(async () => ({
      id: 41,
      tabs: [{ id: 410, windowId: 41, url: 'about:blank' }],
    }));
    const remove = vi.fn(async () => undefined);
    const update = vi.fn(async () => undefined);
    const onRemoved = {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    };
    const onFocusChanged = {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    };
    vi.stubGlobal('browser', {
      windows: {
        getAll: vi.fn(async () => [{
          id: 7,
          focused: true,
          left: 10,
          top: 20,
          width: 1200,
          height: 800,
        }]),
        create,
        get: vi.fn(async () => ({
          id: 41,
          tabs: [{ id: 410, windowId: 41, url: 'about:blank' }],
        })),
        remove,
        update,
        onRemoved,
        onFocusChanged,
      },
      tabs: {
        query: vi.fn(async () => []),
        remove: vi.fn(async () => undefined),
      },
    });

    const session = createPostingWindowSession();
    const [first, second] = await Promise.all([
      session.getOrCreateWindowId(),
      session.getOrCreateWindowId(),
    ]);

    expect(first).toBe(41);
    expect(second).toBe(41);
    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith({
      url: 'about:blank',
      type: 'normal',
      focused: true,
    });
    expect(update).toHaveBeenNthCalledWith(1, 41, {
      left: 634,
      top: 124,
      width: 560,
      height: 680,
    });
    expect(update).toHaveBeenNthCalledWith(2, 7, { focused: true });

    await session.releaseBootstrapTab();
    expect(remove).toHaveBeenCalledWith(41);
  });

  it('removes only the bootstrap tab when a failed posting tab must remain', async () => {
    const removeTab = vi.fn(async () => undefined);
    const removeWindow = vi.fn(async () => undefined);
    const onRemoved = {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    };
    const onFocusChanged = {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    };
    vi.stubGlobal('browser', {
      windows: {
        getAll: vi.fn(async () => []),
        create: vi.fn(async () => ({
          id: 42,
          tabs: [{ id: 420, windowId: 42, url: 'about:blank' }],
        })),
        get: vi.fn(async () => ({
          id: 42,
          tabs: [
            { id: 420, windowId: 42, url: 'about:blank' },
            { id: 421, windowId: 42, url: 'https://x.com/compose/post' },
          ],
        })),
        remove: removeWindow,
        update: vi.fn(async () => undefined),
        onRemoved,
        onFocusChanged,
      },
      tabs: {
        query: vi.fn(async () => []),
        remove: removeTab,
      },
    });

    const session = createPostingWindowSession();
    await session.getOrCreateWindowId();
    await session.releaseBootstrapTab();

    expect(removeTab).toHaveBeenCalledWith(420);
    expect(removeWindow).not.toHaveBeenCalled();
  });

  it('closes the dedicated window and aborts before posting if sizing fails', async () => {
    const remove = vi.fn(async () => undefined);
    const update = vi.fn(async (windowId: number) => {
      if (windowId === 47) throw new Error('invalid bounds');
      return undefined;
    });
    vi.stubGlobal('browser', {
      windows: {
        getAll: vi.fn(async () => [{
          id: 7,
          type: 'normal',
          focused: true,
          left: 0,
          top: 0,
          width: 900,
          height: 700,
        }]),
        create: vi.fn(async () => ({
          id: 47,
          tabs: [{ id: 470, windowId: 47, url: 'about:blank' }],
        })),
        get: vi.fn(async () => undefined),
        remove,
        update,
        onRemoved: {
          addListener: vi.fn(),
          removeListener: vi.fn(),
        },
        onFocusChanged: {
          addListener: vi.fn(),
          removeListener: vi.fn(),
        },
      },
      tabs: {
        query: vi.fn(async () => []),
        remove: vi.fn(async () => undefined),
      },
    });

    const session = createPostingWindowSession();

    await expect(session.getOrCreateWindowId()).rejects.toThrow(
      'Tutti could not size the dedicated posting window',
    );
    expect(remove).toHaveBeenCalledWith(47);
    expect(update).toHaveBeenLastCalledWith(7, { focused: true });

    await session.releaseBootstrapTab();
  });

  it('uses safe default bounds when the covering window reports invalid geometry', async () => {
    const update = vi.fn(async () => undefined);
    vi.stubGlobal('browser', {
      windows: {
        getAll: vi.fn(async () => [{
          id: 7,
          type: 'normal',
          focused: true,
          left: Number.NaN,
          top: Number.POSITIVE_INFINITY,
          width: 0,
          height: -1,
        }]),
        create: vi.fn(async () => ({
          id: 48,
          tabs: [{ id: 480, windowId: 48, url: 'about:blank' }],
        })),
        get: vi.fn(async () => ({
          id: 48,
          tabs: [{ id: 480, windowId: 48, url: 'about:blank' }],
        })),
        remove: vi.fn(async () => undefined),
        update,
        onRemoved: {
          addListener: vi.fn(),
          removeListener: vi.fn(),
        },
        onFocusChanged: {
          addListener: vi.fn(),
          removeListener: vi.fn(),
        },
      },
      tabs: {
        query: vi.fn(async () => []),
        remove: vi.fn(async () => undefined),
      },
    });

    const session = createPostingWindowSession();
    await session.getOrCreateWindowId();

    expect(update).toHaveBeenNthCalledWith(1, 48, {
      width: 560,
      height: 680,
    });

    await session.releaseBootstrapTab();
  });

  it('detects when the user closes the posting window', async () => {
    let removedListener: ((windowId: number) => void) | undefined;
    const removeListener = vi.fn();
    const onFocusChanged = {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    };
    vi.stubGlobal('browser', {
      windows: {
        getAll: vi.fn(async () => []),
        create: vi.fn(async () => ({
          id: 43,
          tabs: [{ id: 430, windowId: 43, url: 'about:blank' }],
        })),
        get: vi.fn(async () => undefined),
        remove: vi.fn(async () => undefined),
        update: vi.fn(async () => undefined),
        onRemoved: {
          addListener: vi.fn((listener: (windowId: number) => void) => {
            removedListener = listener;
          }),
          removeListener,
        },
        onFocusChanged,
      },
      tabs: {
        query: vi.fn(async () => []),
        remove: vi.fn(async () => undefined),
      },
    });

    const session = createPostingWindowSession();
    const windowId = await session.getOrCreateWindowId();
    const closed = session.waitForUnexpectedClose(windowId);
    removedListener?.(windowId);

    await expect(closed).resolves.toBeUndefined();
    await session.releaseBootstrapTab();
    expect(removeListener).toHaveBeenCalledWith(removedListener);
  });

  it('returns focus to the latest user window when the posting window steals it', async () => {
    let focusListener: ((windowId: number) => void) | undefined;
    const update = vi.fn(async () => undefined);
    const removeFocusListener = vi.fn();
    vi.stubGlobal('browser', {
      windows: {
        getAll: vi.fn(async () => [{
          id: 7,
          type: 'normal',
          focused: true,
        }]),
        create: vi.fn(async () => ({
          id: 44,
          tabs: [{ id: 440, windowId: 44, url: 'about:blank' }],
        })),
        get: vi.fn(async () => ({
          id: 44,
          tabs: [{ id: 440, windowId: 44, url: 'about:blank' }],
        })),
        remove: vi.fn(async () => undefined),
        update,
        onRemoved: {
          addListener: vi.fn(),
          removeListener: vi.fn(),
        },
        onFocusChanged: {
          addListener: vi.fn((listener: (windowId: number) => void) => {
            focusListener = listener;
          }),
          removeListener: removeFocusListener,
        },
      },
      tabs: {
        query: vi.fn(async () => []),
        remove: vi.fn(async () => undefined),
      },
    });

    const session = createPostingWindowSession();
    await session.getOrCreateWindowId();
    update.mockClear();

    focusListener?.(9);
    focusListener?.(44);
    await vi.waitFor(() => {
      expect(update).toHaveBeenCalledWith(9, { focused: true });
    });
    expect(session.getFocusReturnWindowId()).toBe(9);

    await session.releaseBootstrapTab();
    expect(removeFocusListener).toHaveBeenCalledWith(focusListener);
  });

  it('leases focus only for media dispatch and then restores the user window once', async () => {
    let focusListener: ((windowId: number) => void) | undefined;
    let focusedWindowId = 7;
    const update = vi.fn(async (windowId: number) => {
      focusedWindowId = windowId;
      focusListener?.(windowId);
      return {};
    });
    vi.stubGlobal('browser', {
      windows: {
        getAll: vi.fn(async () => [{
          id: 7,
          type: 'normal',
          focused: true,
          left: 0,
          top: 0,
          width: 1200,
          height: 800,
        }]),
        create: vi.fn(async () => ({
          id: 45,
          tabs: [{ id: 450, windowId: 45, url: 'about:blank' }],
        })),
        get: vi.fn(async (windowId: number) => ({
          id: windowId,
          focused: focusedWindowId === windowId,
          tabs: [{ id: 450, windowId: 45, url: 'about:blank' }],
        })),
        remove: vi.fn(async () => undefined),
        update,
        onRemoved: {
          addListener: vi.fn(),
          removeListener: vi.fn(),
        },
        onFocusChanged: {
          addListener: vi.fn((listener: (windowId: number) => void) => {
            focusListener = listener;
          }),
          removeListener: vi.fn(),
        },
      },
      tabs: {
        query: vi.fn(async () => []),
        remove: vi.fn(async () => undefined),
      },
    });

    const session = createPostingWindowSession();
    await session.getOrCreateWindowId();
    update.mockClear();

    await expect(handlePostingMediaFocus(45, 'acquire')).resolves.toEqual({
      ok: true,
      active: true,
    });
    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenNthCalledWith(1, 45, { focused: true });

    await expect(handlePostingMediaFocus(45, 'release')).resolves.toEqual({
      ok: true,
      active: true,
    });
    expect(update).toHaveBeenCalledTimes(2);
    expect(update).toHaveBeenNthCalledWith(2, 7, { focused: true });

    await session.releaseBootstrapTab();
  });

  it('focuses a video window once at startup and never reclaims focus later', async () => {
    let focusListener: ((windowId: number) => void) | undefined;
    let focusedWindowId = 50;
    const update = vi.fn(async (windowId: number) => {
      focusedWindowId = windowId;
      return {};
    });
    const onFocusLost = vi.fn();
    const onFocusRestored = vi.fn();
    vi.stubGlobal('browser', {
      windows: {
        getAll: vi.fn(async () => [{
          id: 7,
          type: 'normal',
          focused: true,
          left: 0,
          top: 0,
          width: 1200,
          height: 800,
        }]),
        create: vi.fn(async () => ({
          id: 50,
          tabs: [{ id: 500, windowId: 50, url: 'chrome-extension://test/posting-wait.html' }],
        })),
        get: vi.fn(async (windowId: number) => ({
          id: windowId,
          focused: focusedWindowId === windowId,
          tabs: [{ id: 500, windowId: 50, url: 'chrome-extension://test/posting-wait.html' }],
        })),
        remove: vi.fn(async () => undefined),
        update,
        onRemoved: {
          addListener: vi.fn(),
          removeListener: vi.fn(),
        },
        onFocusChanged: {
          addListener: vi.fn((listener: (windowId: number) => void) => {
            focusListener = listener;
          }),
          removeListener: vi.fn(),
        },
      },
      tabs: {
        query: vi.fn(async () => []),
        remove: vi.fn(async () => undefined),
      },
    });

    const session = createPostingWindowSession({
      focusMode: 'foreground-video',
      initialUrl: 'chrome-extension://test/posting-wait.html',
      onFocusLost,
      onFocusRestored,
    });
    await session.getOrCreateWindowId();

    expect(browser.windows.create).toHaveBeenCalledWith({
      url: 'chrome-extension://test/posting-wait.html',
      type: 'normal',
      focused: true,
    });
    expect(update).toHaveBeenCalledTimes(1);
    expect(update).not.toHaveBeenCalledWith(7, { focused: true });
    expect(session.getFocusReturnWindowId()).toBeUndefined();

    update.mockClear();
    focusedWindowId = 7;
    focusListener?.(-1);
    focusListener?.(7);
    expect(onFocusLost).toHaveBeenCalledTimes(1);

    await expect(handlePostingMediaFocus(50, 'acquire')).resolves.toEqual({
      ok: true,
      active: false,
    });
    await expect(handlePostingMediaFocus(50, 'release')).resolves.toEqual({
      ok: true,
      active: false,
    });
    expect(update).not.toHaveBeenCalled();

    focusedWindowId = 50;
    focusListener?.(50);
    expect(onFocusRestored).toHaveBeenCalledTimes(1);
    expect(update).not.toHaveBeenCalled();

    await session.releaseBootstrapTab();
  });

  it('does not reclaim focus after the user selects another window during the lease', async () => {
    vi.useFakeTimers();
    let focusListener: ((windowId: number) => void) | undefined;
    const update = vi.fn(async () => undefined);
    vi.stubGlobal('browser', {
      windows: {
        getAll: vi.fn(async () => [{
          id: 7,
          type: 'normal',
          focused: true,
        }]),
        create: vi.fn(async () => ({
          id: 46,
          tabs: [{ id: 460, windowId: 46, url: 'about:blank' }],
        })),
        get: vi.fn(async () => ({
          id: 46,
          focused: false,
          tabs: [{ id: 460, windowId: 46, url: 'about:blank' }],
        })),
        remove: vi.fn(async () => undefined),
        update,
        onRemoved: {
          addListener: vi.fn(),
          removeListener: vi.fn(),
        },
        onFocusChanged: {
          addListener: vi.fn((listener: (windowId: number) => void) => {
            focusListener = listener;
          }),
          removeListener: vi.fn(),
        },
      },
      tabs: {
        query: vi.fn(async () => []),
        remove: vi.fn(async () => undefined),
      },
    });

    const session = createPostingWindowSession();
    await session.getOrCreateWindowId();
    update.mockClear();

    await handlePostingMediaFocus(46, 'acquire');
    focusListener?.(9);
    update.mockClear();

    await vi.advanceTimersByTimeAsync(1_000);
    expect(update).not.toHaveBeenCalled();

    await expect(handlePostingMediaFocus(46, 'release')).resolves.toEqual({
      ok: true,
      active: false,
    });
    expect(update).not.toHaveBeenCalled();
    expect(session.getFocusReturnWindowId()).toBe(9);

    await session.releaseBootstrapTab();
  });

  it('restores the user window when the content-side media release is delayed', async () => {
    vi.useFakeTimers();
    let focusListener: ((windowId: number) => void) | undefined;
    let focusedWindowId = 7;
    const update = vi.fn(async (windowId: number) => {
      focusedWindowId = windowId;
      focusListener?.(windowId);
      return {};
    });
    vi.stubGlobal('browser', {
      windows: {
        getAll: vi.fn(async () => [{ id: 7, type: 'normal', focused: true }]),
        create: vi.fn(async () => ({
          id: 49,
          tabs: [{ id: 490, windowId: 49, url: 'about:blank' }],
        })),
        get: vi.fn(async (windowId: number) => ({
          id: windowId,
          focused: focusedWindowId === windowId,
          tabs: [{ id: 490, windowId: 49, url: 'about:blank' }],
        })),
        remove: vi.fn(async () => undefined),
        update,
        onRemoved: {
          addListener: vi.fn(),
          removeListener: vi.fn(),
        },
        onFocusChanged: {
          addListener: vi.fn((listener: (windowId: number) => void) => {
            focusListener = listener;
          }),
          removeListener: vi.fn(),
        },
      },
      tabs: {
        query: vi.fn(async () => []),
        remove: vi.fn(async () => undefined),
      },
    });

    const session = createPostingWindowSession();
    await session.getOrCreateWindowId();
    update.mockClear();

    await handlePostingMediaFocus(49, 'acquire');
    await vi.advanceTimersByTimeAsync(1_000);

    expect(update).toHaveBeenNthCalledWith(1, 49, { focused: true });
    expect(update).toHaveBeenNthCalledWith(2, 7, { focused: true });

    await session.releaseBootstrapTab();
  });
});
