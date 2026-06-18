import type { ExtensionUpdateState } from '../messages';

export interface RuntimeLike {
  getManifest?: () => { version?: string };
  reload: () => void;
  onUpdateAvailable?: {
    addListener: (listener: (details: { version: string }) => void) => void;
  };
}

export interface StorageAreaLike {
  get: (key: string) => Promise<Record<string, unknown>>;
  set: (items: Record<string, unknown>) => Promise<void>;
  remove: (key: string) => Promise<void>;
}

export interface ExtensionUpdateManagerOptions {
  runtime: RuntimeLike;
  storage?: StorageAreaLike;
  isBusy?: () => boolean;
  notifyAvailable?: (state: ExtensionUpdateState) => void | Promise<void>;
  schedule?: (fn: () => void, delayMs: number) => unknown;
  reloadDelayMs?: number;
}

export type ApplyExtensionUpdateResult =
  | { ok: true }
  | { ok: false; error: 'no_update_available' | 'posting_in_progress' | 'reload_failed'; detail?: string };

const STORAGE_KEY = 'extensionUpdateState';

function versionParts(version: string | undefined): number[] {
  return (version ?? '')
    .split('.')
    .map((part) => Number.parseInt(part, 10))
    .filter((part) => Number.isFinite(part));
}

function compareVersions(a: string | undefined, b: string | undefined): number {
  const left = versionParts(a);
  const right = versionParts(b);
  const length = Math.max(left.length, right.length);
  for (let i = 0; i < length; i += 1) {
    const diff = (left[i] ?? 0) - (right[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

function isUpdateState(value: unknown): value is ExtensionUpdateState {
  if (!value || typeof value !== 'object') return false;
  const state = value as Partial<ExtensionUpdateState>;
  return typeof state.available === 'boolean'
    && (state.version === undefined || typeof state.version === 'string')
    && (state.applying === undefined || typeof state.applying === 'boolean');
}

export function createExtensionUpdateManager(options: ExtensionUpdateManagerOptions) {
  const schedule = options.schedule ?? ((fn: () => void, delayMs: number) => setTimeout(fn, delayMs));
  const reloadDelayMs = options.reloadDelayMs ?? 100;
  let state: ExtensionUpdateState = { available: false };
  let initialized = false;

  async function persist(next: ExtensionUpdateState): Promise<void> {
    state = next;
    if (!options.storage) return;
    if (!next.available) {
      await options.storage.remove(STORAGE_KEY);
      return;
    }
    await options.storage.set({ [STORAGE_KEY]: next });
  }

  async function clearIfInstalled(next: ExtensionUpdateState): Promise<void> {
    const currentVersion = options.runtime.getManifest?.().version;
    if (next.available && compareVersions(next.version, currentVersion) <= 0) {
      await persist({ available: false });
      return;
    }
    state = next;
  }

  async function load(): Promise<void> {
    if (!options.storage) return;
    const stored = await options.storage.get(STORAGE_KEY);
    const next = stored[STORAGE_KEY];
    if (isUpdateState(next)) {
      await clearIfInstalled(next);
    }
  }

  async function markAvailable(version: string): Promise<void> {
    const next: ExtensionUpdateState = { available: true, version, applying: false };
    await persist(next);
    await options.notifyAvailable?.(next);
  }

  async function init(): Promise<void> {
    if (initialized) return;
    initialized = true;
    await load();
    options.runtime.onUpdateAvailable?.addListener((details) => {
      void markAvailable(details.version);
    });
  }

  async function getState(): Promise<ExtensionUpdateState> {
    if (!initialized) await init();
    return { ...state };
  }

  async function applyUpdate(): Promise<ApplyExtensionUpdateResult> {
    const current = await getState();
    if (!current.available) return { ok: false, error: 'no_update_available' };
    if (options.isBusy?.()) return { ok: false, error: 'posting_in_progress' };

    await persist({ ...current, applying: true });
    try {
      schedule(() => {
        options.runtime.reload();
      }, reloadDelayMs);
      return { ok: true };
    } catch (e) {
      await persist({ ...current, applying: false });
      return {
        ok: false,
        error: 'reload_failed',
        detail: e instanceof Error ? e.message : String(e),
      };
    }
  }

  return {
    init,
    getState,
    applyUpdate,
    async _markAvailableForTest(version: string): Promise<void> {
      await markAvailable(version);
    },
  };
}
