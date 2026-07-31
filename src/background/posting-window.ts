import { closeTabSafely } from './tab-management';

export interface PostingWindowSession {
  getOrCreateWindowId(): Promise<number>;
  getFocusReturnWindowId(): number | undefined;
  waitForUnexpectedClose(windowId: number): Promise<void>;
  releaseBootstrapTab(): Promise<void>;
}

export interface PostingWindowSessionOptions {
  focusMode?: 'background' | 'foreground-video';
  initialUrl?: string;
  onFocusLost?: (windowId: number) => void;
  onFocusRestored?: (windowId: number) => void;
}

interface PostingWindowState {
  windowId: number;
  bootstrapTabId: number;
  focusReturnWindowId?: number;
}

interface RegisteredPostingWindow {
  acquireMediaFocus(): Promise<boolean>;
  releaseMediaFocus(): Promise<boolean>;
}

const POSTING_WINDOW_WIDTH = 560;
const POSTING_WINDOW_HEIGHT = 680;
const POSTING_WINDOW_MARGIN = 16;
const MEDIA_FOCUS_LEASE_MAX_MS = 1_000;
const activePostingWindows = new Map<number, RegisteredPostingWindow>();

export async function handlePostingMediaFocus(
  windowId: number | undefined,
  phase: 'acquire' | 'release',
): Promise<{ ok: boolean; active: boolean }> {
  if (typeof windowId !== 'number') return { ok: false, active: false };
  const postingWindow = activePostingWindows.get(windowId);
  if (!postingWindow) return { ok: true, active: false };
  const active = phase === 'acquire'
    ? await postingWindow.acquireMediaFocus()
    : await postingWindow.releaseMediaFocus();
  return { ok: true, active };
}

/**
 * One dedicated browser window per real posting request.
 *
 * Chromium creates the window through its normal focused path. Text/image
 * requests immediately return focus to the user's window. Real video requests
 * keep the new window focused from the beginning because X suspends video
 * processing in an unfocused browser window. A bootstrap tab keeps the window
 * alive while concurrent posting lanes start; releasing it leaves only
 * failed/user-action tabs behind, or closes the window after successful tabs
 * have been cleaned up.
 */
export function createPostingWindowSession(
  options: PostingWindowSessionOptions = {},
): PostingWindowSession {
  const focusMode = options.focusMode ?? 'background';
  let statePromise: Promise<PostingWindowState> | undefined;
  let currentState: PostingWindowState | undefined;
  const expectedWindowCloses = new Set<number>();
  const unexpectedlyClosedWindows = new Set<number>();
  const closeWaiters = new Map<number, Set<() => void>>();
  let focusRestoreInFlight = false;
  let videoFocusLost = false;
  let mediaFocusLeaseActive = false;
  let mediaFocusLeaseTimer: ReturnType<typeof setTimeout> | undefined;
  const cancelMediaFocusLeaseTimer = (): void => {
    if (mediaFocusLeaseTimer) clearTimeout(mediaFocusLeaseTimer);
    mediaFocusLeaseTimer = undefined;
  };
  const onWindowRemoved = (windowId: number): void => {
    activePostingWindows.delete(windowId);
    if (expectedWindowCloses.delete(windowId)) return;
    unexpectedlyClosedWindows.add(windowId);
    if (currentState?.windowId === windowId) {
      if (videoFocusLost) options.onFocusRestored?.(windowId);
      videoFocusLost = false;
      cancelMediaFocusLeaseTimer();
      mediaFocusLeaseActive = false;
      currentState = undefined;
      statePromise = undefined;
    }
    for (const resolve of closeWaiters.get(windowId) ?? []) resolve();
    closeWaiters.delete(windowId);
  };
  const onWindowFocusChanged = (windowId: number): void => {
    const state = currentState;
    if (!state) return;
    if (windowId !== state.windowId) {
      if (windowId >= 0) state.focusReturnWindowId = windowId;
      // The user chose another window during the short media focus lease.
      // Keep their choice and never pull focus back from it.
      cancelMediaFocusLeaseTimer();
      mediaFocusLeaseActive = false;
      if (focusMode === 'foreground-video' && !videoFocusLost) {
        videoFocusLost = true;
        options.onFocusLost?.(state.windowId);
      }
      return;
    }
    if (focusMode === 'foreground-video') {
      if (videoFocusLost) {
        videoFocusLost = false;
        options.onFocusRestored?.(state.windowId);
      }
      return;
    }
    if (mediaFocusLeaseActive) return;
    const focusReturnWindowId = state.focusReturnWindowId;
    if (
      typeof focusReturnWindowId !== 'number' ||
      focusReturnWindowId === state.windowId ||
      focusRestoreInFlight
    ) {
      return;
    }
    restoreUserWindowFocus(focusReturnWindowId);
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
    statePromise ??= createPostingWindow({
      initialUrl: options.initialUrl,
      restoreOriginalFocus: focusMode === 'background',
    }).then((state) => {
      currentState = state;
      activePostingWindows.set(state.windowId, {
        acquireMediaFocus,
        releaseMediaFocus,
      });
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
    return focusMode === 'background'
      ? currentState?.focusReturnWindowId
      : undefined;
  }

  async function acquireMediaFocus(): Promise<boolean> {
    const state = currentState;
    if (!state) return false;
    // Foreground video mode takes focus once, before any posting work begins.
    // Never steal it back later if the user chooses another window.
    if (focusMode === 'foreground-video') {
      const postingWindow = await browser.windows.get(state.windowId).catch(() => undefined);
      return postingWindow?.focused === true;
    }
    mediaFocusLeaseActive = true;
    try {
      await browser.windows.update(state.windowId, { focused: true });
      if (mediaFocusLeaseActive) {
        cancelMediaFocusLeaseTimer();
        mediaFocusLeaseTimer = setTimeout(() => {
          void releaseMediaFocus();
        }, MEDIA_FOCUS_LEASE_MAX_MS);
      }
      return mediaFocusLeaseActive;
    } catch {
      cancelMediaFocusLeaseTimer();
      mediaFocusLeaseActive = false;
      return false;
    }
  }

  async function releaseMediaFocus(): Promise<boolean> {
    if (focusMode === 'foreground-video') return false;
    cancelMediaFocusLeaseTimer();
    if (!mediaFocusLeaseActive) return false;
    mediaFocusLeaseActive = false;
    const state = currentState;
    const focusReturnWindowId = state?.focusReturnWindowId;
    if (
      !state ||
      typeof focusReturnWindowId !== 'number' ||
      focusReturnWindowId === state.windowId
    ) {
      return false;
    }
    const postingWindow = await browser.windows.get(state.windowId).catch(() => undefined);
    if (postingWindow?.focused !== true) return false;
    await browser.windows.update(focusReturnWindowId, { focused: true }).catch(() => undefined);
    return true;
  }

  async function releaseBootstrapTab(): Promise<void> {
    const pending = statePromise;
    const endingState = currentState;
    statePromise = undefined;
    if (endingState) activePostingWindows.delete(endingState.windowId);
    currentState = undefined;
    cancelMediaFocusLeaseTimer();
    mediaFocusLeaseActive = false;
    if (videoFocusLost) {
      videoFocusLost = false;
      if (endingState) options.onFocusRestored?.(endingState.windowId);
    }
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
    }
  }

  return {
    getOrCreateWindowId,
    getFocusReturnWindowId,
    waitForUnexpectedClose,
    releaseBootstrapTab,
  };
}

async function createPostingWindow(options: {
  initialUrl?: string;
  restoreOriginalFocus: boolean;
}): Promise<PostingWindowState> {
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
    url: options.initialUrl ?? 'about:blank',
    type: 'normal',
    focused: true,
  });
  if (!created || typeof created.id !== 'number') {
    throw new Error('Tutti could not create a dedicated posting window');
  }
  const createdWindowId = created.id;
  try {
    await browser.windows.update(created.id, postingWindowBounds(coveringWindow));
  } catch (error) {
    await browser.windows.remove(created.id).catch(() => {});
    throw new Error('Tutti could not size the dedicated posting window', {
      cause: error,
    });
  } finally {
    if (options.restoreOriginalFocus &&
      typeof coveringWindow?.id === 'number' &&
      coveringWindow.id !== originalWindow?.id
    ) {
      await browser.windows.update(coveringWindow.id, { focused: true }).catch(() => {});
    }
    if (options.restoreOriginalFocus && typeof originalWindow?.id === 'number') {
      await browser.windows.update(originalWindow.id, { focused: true }).catch(() => {});
    }
  }
  return await finishCreatedPostingWindow(created, createdWindowId, originalWindow);
}

async function finishCreatedPostingWindow(
  created: Browser.windows.Window,
  createdWindowId: number,
  originalWindow: Browser.windows.Window | undefined,
): Promise<PostingWindowState> {
  const bootstrapTab = created.tabs?.find((tab) => typeof tab.id === 'number')
    ?? (await browser.tabs.query({ windowId: createdWindowId }))
      .find((tab) => typeof tab.id === 'number');
  if (typeof bootstrapTab?.id !== 'number') {
    await browser.windows.remove(createdWindowId).catch(() => {});
    throw new Error('Tutti could not initialize the dedicated posting window');
  }

  return {
    windowId: createdWindowId,
    bootstrapTabId: bootstrapTab.id,
    focusReturnWindowId: originalWindow?.id,
  };
}

function windowArea(window: Browser.windows.Window): number {
  return Math.max(0, finiteWindowNumber(window.width) ?? 0) *
    Math.max(0, finiteWindowNumber(window.height) ?? 0);
}

function postingWindowBounds(
  coveringWindow: Browser.windows.Window | undefined,
): {
  left?: number;
  top?: number;
  width: number;
  height: number;
} {
  const availableWidth = finiteWindowNumber(coveringWindow?.width);
  const availableHeight = finiteWindowNumber(coveringWindow?.height);
  const coveringLeft = finiteWindowNumber(coveringWindow?.left);
  const coveringTop = finiteWindowNumber(coveringWindow?.top);
  const width = POSTING_WINDOW_WIDTH;
  const height = POSTING_WINDOW_HEIGHT;
  const left = typeof coveringLeft === 'number' && typeof availableWidth === 'number'
    ? Math.floor(coveringLeft + Math.max(0, availableWidth - width - POSTING_WINDOW_MARGIN))
    : undefined;
  const top = typeof coveringTop === 'number' && typeof availableHeight === 'number'
    ? Math.floor(coveringTop + Math.max(0, availableHeight - height - POSTING_WINDOW_MARGIN))
    : undefined;
  return {
    ...(typeof left === 'number' ? { left } : {}),
    ...(typeof top === 'number' ? { top } : {}),
    width,
    height,
  };
}

function finiteWindowNumber(value: number | undefined): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}
