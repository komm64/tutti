import { describe, expect, it, vi } from 'vitest';
import { createExtensionUpdateManager, type StorageAreaLike } from './extension-update';

function createStorage(initial: Record<string, unknown> = {}): StorageAreaLike & { data: Record<string, unknown> } {
  const data = { ...initial };
  return {
    data,
    async get(key: string) {
      return { [key]: data[key] };
    },
    async set(items: Record<string, unknown>) {
      Object.assign(data, items);
    },
    async remove(key: string) {
      delete data[key];
    },
  };
}

describe('extension update manager', () => {
  it('records downloaded updates and notifies popup listeners', async () => {
    let updateListener: ((details: { version: string }) => void) | undefined;
    const storage = createStorage();
    const notifyAvailable = vi.fn();
    const manager = createExtensionUpdateManager({
      runtime: {
        getManifest: () => ({ version: '0.5.37' }),
        reload: vi.fn(),
        onUpdateAvailable: {
          addListener: (listener) => {
            updateListener = listener;
          },
        },
      },
      storage,
      notifyAvailable,
    });

    await manager.init();
    updateListener?.({ version: '0.5.38' });
    await Promise.resolve();

    await expect(manager.getState()).resolves.toEqual({
      available: true,
      version: '0.5.38',
      applying: false,
    });
    expect(storage.data.extensionUpdateState).toEqual({
      available: true,
      version: '0.5.38',
      applying: false,
    });
    expect(notifyAvailable).toHaveBeenCalledWith({
      available: true,
      version: '0.5.38',
      applying: false,
    });
  });

  it('requests an update check on init and records available versions', async () => {
    const storage = createStorage();
    const notifyAvailable = vi.fn();
    const requestUpdateCheck = vi.fn(async () => ({
      status: 'update_available' as const,
      version: '0.5.38',
    }));
    const manager = createExtensionUpdateManager({
      runtime: {
        getManifest: () => ({ version: '0.5.37' }),
        reload: vi.fn(),
        requestUpdateCheck,
      },
      storage,
      notifyAvailable,
      now: () => 1000,
      updateCheckIntervalMs: 500,
    });

    await manager.init();

    expect(requestUpdateCheck).toHaveBeenCalledTimes(1);
    expect(storage.data.extensionUpdateLastCheckedAt).toBe(1000);
    await expect(manager.getState()).resolves.toEqual({
      available: true,
      version: '0.5.38',
      applying: false,
    });
    expect(notifyAvailable).toHaveBeenCalledWith({
      available: true,
      version: '0.5.38',
      applying: false,
    });
  });

  it('throttles explicit update checks across background restarts', async () => {
    const requestUpdateCheck = vi.fn(async () => ({ status: 'no_update' as const }));
    const manager = createExtensionUpdateManager({
      runtime: {
        getManifest: () => ({ version: '0.5.37' }),
        reload: vi.fn(),
        requestUpdateCheck,
      },
      storage: createStorage({
        extensionUpdateLastCheckedAt: 1000,
      }),
      now: () => 1200,
      updateCheckIntervalMs: 500,
    });

    await manager.init();

    expect(requestUpdateCheck).not.toHaveBeenCalled();
  });

  it('does not fail init when an explicit update check is unavailable', async () => {
    const updateListener = vi.fn();
    const requestUpdateCheck = vi.fn(async () => {
      throw new Error('update checks unavailable');
    });
    const manager = createExtensionUpdateManager({
      runtime: {
        getManifest: () => ({ version: '0.5.37' }),
        reload: vi.fn(),
        requestUpdateCheck,
        onUpdateAvailable: {
          addListener: updateListener,
        },
      },
      storage: createStorage(),
      now: () => 1000,
      updateCheckIntervalMs: 500,
    });

    await expect(manager.init()).resolves.toBeUndefined();
    expect(requestUpdateCheck).toHaveBeenCalledTimes(1);
    expect(updateListener).toHaveBeenCalledTimes(1);
    await expect(manager.getState()).resolves.toEqual({ available: false });
  });

  it('applies the update only when not posting', async () => {
    const reload = vi.fn();
    const scheduled: Array<() => void> = [];
    const manager = createExtensionUpdateManager({
      runtime: {
        getManifest: () => ({ version: '0.5.37' }),
        reload,
      },
      storage: createStorage({
        extensionUpdateState: { available: true, version: '0.5.38', applying: false },
      }),
      isBusy: () => false,
      schedule: (fn) => {
        scheduled.push(fn);
      },
    });

    await expect(manager.applyUpdate()).resolves.toEqual({ ok: true });
    expect(reload).not.toHaveBeenCalled();
    scheduled[0]?.();
    expect(reload).toHaveBeenCalledTimes(1);
    await expect(manager.getState()).resolves.toEqual({
      available: true,
      version: '0.5.38',
      applying: true,
    });
  });

  it('does not reload while posting is in progress', async () => {
    const reload = vi.fn();
    const manager = createExtensionUpdateManager({
      runtime: {
        getManifest: () => ({ version: '0.5.37' }),
        reload,
      },
      storage: createStorage({
        extensionUpdateState: { available: true, version: '0.5.38', applying: false },
      }),
      isBusy: () => true,
    });

    await expect(manager.applyUpdate()).resolves.toEqual({ ok: false, error: 'posting_in_progress' });
    expect(reload).not.toHaveBeenCalled();
  });

  it('clears stale pending update state after the new version is installed', async () => {
    const storage = createStorage({
      extensionUpdateState: { available: true, version: '0.5.38', applying: false },
    });
    const manager = createExtensionUpdateManager({
      runtime: {
        getManifest: () => ({ version: '0.5.38' }),
        reload: vi.fn(),
      },
      storage,
    });

    await manager.init();

    await expect(manager.getState()).resolves.toEqual({ available: false });
    expect(storage.data.extensionUpdateState).toBeUndefined();
  });
});
