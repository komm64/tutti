import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPostingWindowSession } from './posting-window';

describe('posting window session', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shares one unfocused window across concurrent DOM posting lanes', async () => {
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
      focused: false,
      left: 10,
      top: 20,
      width: 1200,
      height: 800,
    });
    expect(update).toHaveBeenCalledWith(7, { focused: true });

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
});
