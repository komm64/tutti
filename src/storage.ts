import type { PlatformId, PostResultMessage } from './messages';

// ── 設定 (chrome.storage.sync) ──────────────────────────────────────────────

export interface Settings {
  /** Mastodon インスタンス URL (末尾スラッシュなし) */
  mastodonInstance: string;
  /** Misskey インスタンス URL (末尾スラッシュなし) */
  misskeyInstance: string;
  /** dry-run モード: compose 画面までは進めるが post button を押さない(selector 検証用) */
  dryRun: boolean;
}

const DEFAULT_SETTINGS: Settings = {
  mastodonInstance: 'https://mastodon.social',
  misskeyInstance: 'https://misskey.io',
  dryRun: false,
};

export async function getSettings(): Promise<Settings> {
  const stored = await browser.storage.sync.get('settings');
  return { ...DEFAULT_SETTINGS, ...(stored['settings'] as Partial<Settings> | undefined) };
}

export async function saveSettings(settings: Partial<Settings>): Promise<void> {
  const current = await getSettings();
  await browser.storage.sync.set({ settings: { ...current, ...settings } });
}

// ── 下書き (chrome.storage.session) ─────────────────────────────────────────
//
// session ストレージはブラウザセッション中のみ保持され、ブラウザ終了で自動消去。
// テキスト+チェック状態の軽量データだけ持つ(画像/動画は持たない)。

export interface Draft {
  text: string;
  selected: Partial<Record<PlatformId, boolean>>;
}

const DRAFT_KEY = 'draft';

export async function getDraft(): Promise<Draft | null> {
  const stored = await browser.storage.session.get(DRAFT_KEY);
  return (stored[DRAFT_KEY] as Draft | undefined) ?? null;
}

export async function saveDraft(draft: Draft): Promise<void> {
  await browser.storage.session.set({ [DRAFT_KEY]: draft });
}

export async function clearDraft(): Promise<void> {
  await browser.storage.session.remove(DRAFT_KEY);
}

// ── ログイン中アカウント (chrome.storage.local) ─────────────────────────────
//
// 各 SNS の content script がページロード時に検出し background 経由で保存。
// popup でユーザーに「いまどのアカウントで投稿されるか」を表示するため。

export type LastSeenUsers = Partial<Record<PlatformId, string>>;

const LAST_SEEN_USERS_KEY = 'lastSeenUsers';

export async function getLastSeenUsers(): Promise<LastSeenUsers> {
  const stored = await browser.storage.local.get(LAST_SEEN_USERS_KEY);
  return (stored[LAST_SEEN_USERS_KEY] as LastSeenUsers | undefined) ?? {};
}

export async function setLastSeenUser(
  platform: PlatformId,
  username: string,
): Promise<void> {
  const current = await getLastSeenUsers();
  if (current[platform] === username) return;
  await browser.storage.local.set({
    [LAST_SEEN_USERS_KEY]: { ...current, [platform]: username },
  });
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

export async function clearPostHistory(): Promise<void> {
  await browser.storage.local.remove(HISTORY_KEY);
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
