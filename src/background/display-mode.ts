import { getSettings } from '../storage';
import { log } from '../utils/logger';
import { retryTransientTabAction } from './tab-action-retry';

export type TuttiDisplayMode = 'sidepanel' | 'floating' | 'popup';

const FLOATING_WIN_KEY = 'tuttiFloatingWindow';

export async function applyDisplayModeBehavior(): Promise<void> {
  try {
    const { displayMode } = await getSettings();
    const effective = displayMode === 'auto' ? resolveAutoDisplayMode() : displayMode;

    if (effective === 'sidepanel') {
      if (browser.sidePanel?.setPanelBehavior) {
        await browser.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
      }
      await browser.action.setPopup({ popup: '' });
    } else if (effective === 'floating') {
      if (browser.sidePanel?.setPanelBehavior) {
        await browser.sidePanel.setPanelBehavior({ openPanelOnActionClick: false });
      }
      await browser.action.setPopup({ popup: '' });
    } else {
      if (browser.sidePanel?.setPanelBehavior) {
        await browser.sidePanel.setPanelBehavior({ openPanelOnActionClick: false });
      }
      await browser.action.setPopup({ popup: 'popup.html' });
    }
    log.info(`displayMode applied: ${displayMode}${displayMode === 'auto' ? ` (resolved: ${effective})` : ''}`);
  } catch (e) {
    log.warn(`applyDisplayModeBehavior failed: ${e instanceof Error ? e.message : String(e)}`);
  }
}

export function resolveAutoDisplayMode(): TuttiDisplayMode {
  if (typeof browser.sidePanel?.setPanelBehavior === 'function') return 'sidepanel';
  if (typeof browser.windows?.create === 'function') return 'floating';
  return 'popup';
}

export async function openFloatingTutti(): Promise<void> {
  const url = browser.runtime.getURL('/popup.html?floating=1');
  const stored = await browser.storage.local.get(FLOATING_WIN_KEY);
  const saved = stored[FLOATING_WIN_KEY] as {
    id?: number;
    left?: number;
    top?: number;
    width?: number;
    height?: number;
  } | undefined;

  const savedWindowId = saved?.id;
  if (savedWindowId) {
    try {
      const w = await browser.windows.get(savedWindowId);
      if (w) {
        await retryTransientTabAction('focus floating Tutti window', () => (
          browser.windows.update(savedWindowId, { focused: true })
        ));
        return;
      }
    } catch { /* window no longer exists; recreate below */ }
  }

  const created = await browser.windows.create({
    url,
    type: 'popup',
    width: saved?.width ?? 440,
    height: saved?.height ?? 720,
    left: saved?.left ?? undefined,
    top: saved?.top ?? undefined,
    focused: true,
  });
  if (created?.id !== undefined) {
    await browser.storage.local.set({
      [FLOATING_WIN_KEY]: {
        id: created.id,
        left: created.left,
        top: created.top,
        width: created.width,
        height: created.height,
      },
    });
  }
}

export function installFloatingWindowCleanup(): void {
  browser.windows?.onRemoved?.addListener(async (windowId) => {
    const stored = await browser.storage.local.get(FLOATING_WIN_KEY);
    const saved = stored[FLOATING_WIN_KEY] as { id?: number } | undefined;
    if (saved?.id === windowId) {
      await browser.storage.local.set({ [FLOATING_WIN_KEY]: { ...saved, id: undefined } });
    }
  });
}
