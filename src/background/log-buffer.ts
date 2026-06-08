import type { LogEntry } from '../messages';

export interface PersistentLogBuffer {
  load(): Promise<void>;
  entries(): LogEntry[];
  append(entry: LogEntry): void;
  appendBackground(message: string): void;
  clear(): void;
}

export function createPersistentLogBuffer(
  key = 'logBuffer',
  maxEntries = 1000,
): PersistentLogBuffer {
  let buffer: LogEntry[] = [];
  let persistTimer: ReturnType<typeof setTimeout> | undefined;

  function persistDebounced(): void {
    if (persistTimer) clearTimeout(persistTimer);
    persistTimer = setTimeout(() => {
      void browser.storage.local.set({ [key]: buffer }).catch(() => { /* ignore */ });
    }, 1000);
  }

  return {
    async load(): Promise<void> {
      try {
        const stored = await browser.storage.local.get(key);
        const value = stored[key] as LogEntry[] | undefined;
        if (Array.isArray(value)) buffer = value.slice(-maxEntries);
      } catch { /* ignore */ }
    },
    entries(): LogEntry[] {
      return buffer.slice();
    },
    append(entry: LogEntry): void {
      buffer.push(entry);
      if (buffer.length > maxEntries) buffer = buffer.slice(-maxEntries);
      persistDebounced();
    },
    appendBackground(message: string): void {
      this.append({ ts: Date.now(), level: 'INFO', context: 'background', message });
    },
    clear(): void {
      buffer = [];
      void browser.storage.local.remove(key).catch(() => { /* ignore */ });
    },
  };
}
