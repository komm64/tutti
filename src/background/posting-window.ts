import { closeTabSafely } from './tab-management';

export interface PostingWindowSession {
  getOrCreateWindowId(): Promise<number>;
  getFocusReturnWindowId(): number | undefined;
  waitForUnexpectedClose(windowId: number): Promise<void>;
  releaseBootstrapTab(): Promise<void>;
}

interface PostingWindowState {
  windowId: number;
  bootstrapTabId: number;
  focusReturnWindowId?: number;
}

/**
 * One unfocused browser window per real posting request.
 *
 * DOM posting tabs can be active inside this window without replacing the
 * user's active tab in their main browser window. A bootstrap tab keeps the
 * window alive while concurrent posting lanes start; releasing it leaves only
 * failed/user-action tabs behind, or closes the window after successful tabs
 * have been cleaned up.
 */
export function createPostingWindowSession(): PostingWindowSession {
  let statePromise: Promise<PostingWindowState> | undefined;
  let currentState: PostingWindowState | undefined;
  const expectedWindowCloses = new Set<number>();
  const unexpectedlyClosedWindows = new Set<number>();
  const closeWaiters = new Map<number, Set<() => void>>();
  const focusFollowupTimers = new Set<ReturnType<typeof setTimeout>>();
  let focusRestoreInFlight = false;
  const onWindowRemoved = (windowId: number): void => {
    if (expectedWindowCloses.delete(windowId)) return;
    unexpectedlyClosedWindows.add(windowId);
    if (currentState?.windowId === windowId) {
      currentState = undefined;
      statePromise = undefined;
    }
    for (const resolve of closeWaiters.get(windowId) ?? []) resolve();
    closeWaiters.delete(windowId);
  };
  const onWindowFocusChanged = (windowId: number): void => {
    const state = currentState;
    if (!state || windowId < 0) return;
    if (windowId !== state.windowId) {
      state.focusReturnWindowId = windowId;
      return;
    }
    const focusReturnWindowId = state.focusReturnWindowId;
    if (
      typeof focusReturnWindowId !== 'number' ||
      focusReturnWindowId === state.windowId ||
      focusRestoreInFlight
    ) {
      return;
    }
    restoreUserWindowFocus(focusReturnWindowId);
    for (const delayMs of [50, 150]) {
      const timer = setTimeout(() => {
        focusFollowupTimers.delete(timer);
        const latestState = currentState;
        if (!latestState || latestState.windowId !== windowId) return;
        void browser.windows.get(windowId)
          .then((window) => {
            if (window.focused && typeof latestState.focusReturnWindowId === 'number') {
              restoreUserWindowFocus(latestState.focusReturnWindowId);
            }
          })
          .catch(() => {});
      }, delayMs);
      focusFollowupTimers.add(timer);
    }
  };
  let listenerInstalled = false;

  function restoreUserWindowFocus(windowId: number): void {
    if (focusRestoreInFlight) return;
    focusRestoreInFlight = true;
    void browser.windows.update(windowId, { focused: true })
      .catch(() => {})
      .finally(() => {
        focusRestoreInFlight = false;
      });
  }

  async function getOrCreateWindowId(): Promise<number> {
    if (!listenerInstalled) {
      browser.windows.onRemoved.addListener(onWindowRemoved);
      browser.windows.onFocusChanged.addListener(onWindowFocusChanged);
      listenerInstalled = true;
    }
    statePromise ??= createPostingWindow().then((state) => {
      currentState = state;
      return state;
    });
    return (await statePromise).windowId;
  }

  function waitForUnexpectedClose(windowId: number): Promise<void> {
    if (unexpectedlyClosedWindows.has(windowId)) return Promise.resolve();
    return new Promise((resolve) => {
      let waiters = closeWaiters.get(windowId);
      if (!waiters) {
        waiters = new Set();
        closeWaiters.set(windowId, waiters);
      }
      waiters.add(resolve);
    });
  }

  function getFocusReturnWindowId(): number | undefined {
    return currentState?.focusReturnWindowId;
  }

  async function releaseBootstrapTab(): Promise<void> {
    const pending = statePromise;
    statePromise = undefined;
    currentState = undefined;
    try {
      if (!pending) return;
      const state = await pending.catch(() => undefined);
      if (!state) return;
      const postingWindow = await browser.windows.get(state.windowId, {
        populate: true,
      }).catch(() => undefined);
      if (!postingWindow) return;
      const hasPostingTabs = postingWindow.tabs?.some(
        (tab) => tab.id !== state.bootstrapTabId,
      ) === true;
      if (hasPostingTabs) {
        await closeTabSafely(state.bootstrapTabId);
        return;
      }
      // Removing the final tab can leave Chromium's tabs.remove promise pending
      // while the containing window disappears. Close the owned window through
      // the windows API when only the bootstrap tab remains.
      expectedWindowCloses.add(state.windowId);
      await browser.windows.remove(state.windowId).catch(() => {});
    } finally {
      if (listenerInstalled) {
        browser.windows.onRemoved.removeListener(onWindowRemoved);
        browser.windows.onFocusChanged.removeListener(onWindowFocusChanged);
        listenerInstalled = false;
      }
      closeWaiters.clear();
      for (const timer of focusFollowupTimers) clearTimeout(timer);
      focusFollowupTimers.clear();
    }
  }

  return {
    getOrCreateWindowId,
    getFocusReturnWindowId,
    waitForUnexpectedClose,
    releaseBootstrapTab,
  };
}

async function createPostingWindow(): Promise<PostingWindowState> {
  const windows = await browser.windows.getAll();
  const originalWindow = windows.find(
    (window) => window.focused === true,
  );
  const coveringWindow = originalWindow?.type === 'normal'
    ? originalWindow
    : windows
      .filter((window) => window.type === 'normal')
      .sort((a, b) => windowArea(b) - windowArea(a))[0] ?? originalWindow;
  const created = await browser.windows.create({
    url: 'about:blank',
    type: 'normal',
    focused: false,
    ...(typeof coveringWindow?.left === 'number' ? { left: coveringWindow.left } : {}),
    ...(typeof coveringWindow?.top === 'number' ? { top: coveringWindow.top } : {}),
    ...(typeof coveringWindow?.width === 'number' ? { width: coveringWindow.width } : {}),
    ...(typeof coveringWindow?.height === 'number' ? { height: coveringWindow.height } : {}),
  });
  if (!created || typeof created.id !== 'number') {
    throw new Error('Tutti could not create a dedicated posting window');
  }
  if (
    typeof coveringWindow?.id === 'number' &&
    coveringWindow.id !== originalWindow?.id
  ) {
    await browser.windows.update(coveringWindow.id, { focused: true }).catch(() => {});
  }
  if (typeof originalWindow?.id === 'number') {
    await browser.windows.update(originalWindow.id, { focused: true }).catch(() => {});
  }

  const bootstrapTab = created.tabs?.find((tab) => typeof tab.id === 'number')
    ?? (await browser.tabs.query({ windowId: created.id }))
      .find((tab) => typeof tab.id === 'number');
  if (typeof bootstrapTab?.id !== 'number') {
    await browser.windows.remove(created.id).catch(() => {});
    throw new Error('Tutti could not initialize the dedicated posting window');
  }

  return {
    windowId: created.id,
    bootstrapTabId: bootstrapTab.id,
    focusReturnWindowId: originalWindow?.id,
  };
}

function windowArea(window: Browser.windows.Window): number {
  return Math.max(0, window.width ?? 0) * Math.max(0, window.height ?? 0);
}
