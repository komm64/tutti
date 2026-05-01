import type { PlatformId, PostResultMessage } from './messages';

// ── 設定 (chrome.storage.sync) ──────────────────────────────────────────────

export interface Settings {
  /** Mastodon インスタンス URL (末尾スラッシュなし) */
  mastodonInstance: string;
  /** Misskey インスタンス URL (末尾スラッシュなし) */
  misskeyInstance: string;
  /**
   * 自動投稿モード:
   * - `false`(デフォルト): compose 画面までは開いて検証用情報を入れるが、
   *   Post ボタンは押さない(プレビュー / dry-run)。初回ユーザーが事故らないよう
   *   こちらをデフォルトにしている。popup 上の「自動投稿」トグルで切替。
   * - `true`: 通常の自動投稿。Post まで実行する。
   */
  autoPost: boolean;
  /**
   * SNS UI が変わったとき、拡張更新を待たずに selector を入れ替えるための
   * リモート JSON URL。空なら何も fetch しない(コード同梱の default のみ使う)。
   * 形式は `src/utils/selector-overrides.ts` 参照。
   */
  selectorOverrideUrl: string;
}

const DEFAULT_SETTINGS: Settings = {
  mastodonInstance: 'https://mastodon.social',
  misskeyInstance: 'https://misskey.io',
  autoPost: false,
  selectorOverrideUrl: '',
};

export async function getSettings(): Promise<Settings> {
  const stored = await browser.storage.sync.get('settings');
  const raw = (stored['settings'] as Partial<Settings> & { dryRun?: boolean } | undefined) ?? {};
  // 旧 schema (dryRun) からの marigration: dryRun=false なら autoPost=true として
  // 互換、という風には扱わない(意味反転かつデフォルトも変えるので、新規インストール
  // 時は autoPost=false から始まる)。dryRun を読み流すだけ。
  const { dryRun: _ignored, ...rest } = raw;
  void _ignored;
  return { ...DEFAULT_SETTINGS, ...rest };
}

export async function saveSettings(settings: Partial<Settings>): Promise<void> {
  const current = await getSettings();
  await browser.storage.sync.set({ settings: { ...current, ...settings } });
}

// ── 下書き (chrome.storage.session) ─────────────────────────────────────────
//
// session ストレージはブラウザセッション中のみ保持され、ブラウザ終了で自動消去。
// popup を閉じても再開時に text / 選択状態 / 添付メディアが復元される。
// メディアは base64 文字列(ImageAttachment.data 形式)で保存。

export interface DraftMedia {
  name: string;
  type: string;
  data: string; // base64
  durationS?: number; // 動画のみ
}

export interface Draft {
  text: string;
  /** 添付画像(0..4 枚)。session 容量(~10MB)に収まらない場合は省略される */
  images?: DraftMedia[];
  /** 添付動画(0 or 1 件) */
  video?: DraftMedia | null;
}

const DRAFT_KEY = 'draft';

export async function getDraft(): Promise<Draft | null> {
  const stored = await browser.storage.session.get(DRAFT_KEY);
  return (stored[DRAFT_KEY] as Draft | undefined) ?? null;
}

export async function saveDraft(draft: Draft): Promise<void> {
  // session は約 10MB が目安。データが大きすぎる場合は media を落として
  // 最低限 text だけは保存する(quota 例外でテキストごと失わないため)
  try {
    await browser.storage.session.set({ [DRAFT_KEY]: draft });
  } catch (e) {
    console.warn('[Tutti] saveDraft full quota error, retrying without media:', e);
    const lite: Draft = { text: draft.text };
    await browser.storage.session.set({ [DRAFT_KEY]: lite });
  }
}

export async function clearDraft(): Promise<void> {
  await browser.storage.session.remove(DRAFT_KEY);
}

// ── SNS 選択(chrome.storage.local、永続) ─────────────────────────────────
//
// Draft が「投稿後に消す情報(text + media)」だったのに対し、こちらは
// 「次回もそのまま使いたいユーザー設定」。投稿が完了しても、ユーザー操作
// (チェックを変える)以外ではリセットしない。

export type SelectedPlatforms = Partial<Record<PlatformId, boolean>>;

const SELECTED_PLATFORMS_KEY = 'selectedPlatforms';

export async function getSelectedPlatforms(): Promise<SelectedPlatforms | null> {
  const stored = await browser.storage.local.get(SELECTED_PLATFORMS_KEY);
  return (stored[SELECTED_PLATFORMS_KEY] as SelectedPlatforms | undefined) ?? null;
}

export async function saveSelectedPlatforms(s: SelectedPlatforms): Promise<void> {
  await browser.storage.local.set({ [SELECTED_PLATFORMS_KEY]: s });
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
