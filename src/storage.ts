import type { PlatformId, PostResultMessage } from './messages';

// ── 設定 (chrome.storage.sync) ──────────────────────────────────────────────

export interface Settings {
  /** Mastodon インスタンス URL (末尾スラッシュなし) */
  mastodonInstance: string;
}

const DEFAULT_SETTINGS: Settings = {
  mastodonInstance: 'https://mastodon.social',
};

export async function getSettings(): Promise<Settings> {
  const stored = await browser.storage.sync.get('settings');
  return { ...DEFAULT_SETTINGS, ...(stored['settings'] as Partial<Settings> | undefined) };
}

export async function saveSettings(settings: Partial<Settings>): Promise<void> {
  const current = await getSettings();
  await browser.storage.sync.set({ settings: { ...current, ...settings } });
}

// ── 投稿履歴 (chrome.storage.local) ─────────────────────────────────────────

export interface HistoryEntry {
  id: string;
  /** 投稿テキストの先頭 80 文字 */
  textPreview: string;
  platforms: PlatformId[];
  /** platform → success */
  results: Partial<Record<PlatformId, boolean>>;
  hasMedia: boolean;
  timestamp: number;
}

const HISTORY_KEY = 'postHistory';
const MAX_HISTORY = 20;

export async function getPostHistory(): Promise<HistoryEntry[]> {
  const stored = await browser.storage.local.get(HISTORY_KEY);
  return (stored[HISTORY_KEY] as HistoryEntry[] | undefined) ?? [];
}

export async function addToPostHistory(
  text: string,
  results: PostResultMessage[],
  hasMedia: boolean,
): Promise<void> {
  const entry: HistoryEntry = {
    id: Date.now().toString(36),
    textPreview: text.slice(0, 80),
    platforms: results.map((r) => r.platform),
    results: Object.fromEntries(results.map((r) => [r.platform, r.success])),
    hasMedia,
    timestamp: Date.now(),
  };

  const history = await getPostHistory();
  await browser.storage.local.set({
    [HISTORY_KEY]: [entry, ...history].slice(0, MAX_HISTORY),
  });
}
