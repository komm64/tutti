import type { LogLevel, PlatformId, PostResultMessage } from './messages';
import { clearDraftMedia, getDraftMedia, saveDraftMedia } from './utils/draft-media-store';

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
  /**
   * ログレベル。Beta は INFO デフォルト、正式版で ERROR にしたい想定。
   * Settings 画面のドロップダウンから切替。background は LOG_APPEND を
   * level に関係なく ring buffer に貯めるので、後から絞ってダウンロードできる。
   */
  logLevel: LogLevel;
  /**
   * popup の「Report」 client-side dedup (24h cooldown) を無効化する。
   * 個人 dev で同じエラーを連続報告したいとき用。default false (= dedup 有効、
   * 一般ユーザーが同じ borked browser state で issue tracker を埋めるのを防ぐ)。
   * options 画面の checkbox から切替、ON にすると既存の dedup 履歴も clear する。
   */
  disableReportDedup: boolean;
  /**
   * 投稿成功後、 post URL を新タブで自動 open する (v0.4.77〜)。
   * - `'always'`: 全 投稿 (各 SNS の URL すべて) を open
   * - `'on-issue'` (default): verify hard error / verify-error のときだけ open
   *   (caption 抜け / 画像抜け 等の事故検知時に user 確認を促す)
   * - `'never'`: 自動 open しない (従来 v0.4.76 以前の挙動。 user は popup の
   *   ✓↗ link を click して確認)
   */
  autoOpenPostUrl: 'always' | 'on-issue' | 'never';
  /**
   * Pixiv の "Visible to" (x_restrict) フィールド (v0.4.78〜)。
   * R-18 / R-18G 投稿者向けの default 切替。 `'general'` (default) はクロスポスト
   * 標準。 R-18 / r18g は user が成人向け作品中心の場合のみ。
   */
  pixivVisibility: 'general' | 'r18' | 'r18g';
  /**
   * Pixiv の "AI-generated work" (ai_type) (v0.4.78〜)。
   * AI artist 向け切替。 `'notAiGenerated'` (default) / `'aiGenerated'`。
   */
  pixivAiType: 'notAiGenerated' | 'aiGenerated';
  /**
   * 横長動画を 9:16 縦に letterbox する (v0.4.81〜)。
   * `true` で、 横長 (W > H) 動画 + 選択中に TikTok / YouTube Shorts / IG Reels が
   * 含まれる場合に、 ffmpeg で 1080×1920 に letterbox + ぼかし背景に変換する。
   * SNS 側の自動 letterbox (黒帯) より見栄えが良いが、 横長 SNS にも同じ 9:16 動画
   * が行く tradeoff。 default false。
   */
  autoLetterboxVerticalVideo: boolean;
  /**
   * SNS 組み合わせプリセット (v0.4.91〜)。 user が頻用する SNS の組合せを
   * 名前付きで保存。 popup の preset chip で 1-click 適用。
   * 例: 「音楽用 = X + Bluesky + Misskey」、 「英語向け = X + Threads + Mastodon」
   */
  snsPresets: Array<{ id: string; name: string; platforms: PlatformId[] }>;
  /**
   * Tutti UI 言語 (v0.5.2〜)。 'auto' は Chrome の browser locale に従う、
   * それ以外は明示指定。 Settings 画面で切替可能。 user が browser を English に
   * してるが Tutti は Japanese で使いたい、 等の override 用途。
   * 値は Chrome の locale code: 'en', 'ja', 'zh_CN', 'es', 等。
   */
  uiLanguage: string;
  /**
   * Tutti UI の表示方式 (v0.5.0〜)。 user の好みに合わせて切替:
   * - `'popup'` (default): browser_action popup。 click でアイコン下に出る。
   *   tab focus を移すと閉じる Chrome 仕様の制約あり (v0.4.96 の state 復元で
   *   緩和済だが完全には防げない)。
   * - `'sidepanel'`: Chrome side panel API (Chrome 114+)。 右端に dock した
   *   状態で開く。 tab を行き来しても閉じない。 user が × で閉じるまで開いた
   *   まま。
   * - `'floating'`: 独立した popup window (chrome.windows.create)。 user が
   *   位置・サイズを自由に変えられる。 multi-monitor 友好的。 OS の window と
   *   して扱われる (タスクバー / Alt+Tab に出る)。
   */
  /**
   * v0.5.6〜 'auto' を追加。 新規 install のデフォルト。 起動時に sidepanel
   * (Chrome 114+) → floating → popup の順で capability 検出して 1 つに着地する。
   * 旧 install (v0.5.5 以前) は 'popup' のまま、 user が明示的に 'auto' を
   * 選ぶまで動作変わらず (= 既存 UX 破壊しない)。
   */
  displayMode: 'auto' | 'popup' | 'sidepanel' | 'floating';
  /**
   * 履歴 entry に添付メディア (画像 / 動画) を保存するか (v0.5.5〜)。
   * - `false` (default): メディアは保存しない。 履歴は text + 結果メタデータのみ。
   * - `true`: IndexedDB に media を 7 日間保存。 「失敗 SNS だけ再送」 を popup
   *   から push できるようになる。 storage 容量を喰うので opt-in。
   */
  historyKeepMedia: boolean;
}

const DEFAULT_SETTINGS: Settings = {
  mastodonInstance: 'https://mastodon.social',
  misskeyInstance: 'https://misskey.io',
  autoPost: false,
  // hot-fix endpoint: GitHub Pages で配信される `selectors.json`。
  // 各 SNS の UI 変更で selector が壊れたとき、拡張更新を待たず自動 PR
  // (auto-triage.yml) のマージで全ユーザーに反映される。
  // 自分の運用 (selectorOverrideUrl 空・自社相当) ではない一般ユーザーは
  // この default を継続使用する想定。
  selectorOverrideUrl: 'https://komm64.github.io/tutti/selectors.json',
  logLevel: 'INFO',
  disableReportDedup: false,
  // v0.5.7〜 default を 'always' に。 旧 default ('on-issue') では成功投稿で URL が
  // 開かず 「自分のポストを確認しに行けない」 と感じる UX だった。 「always」 は
  // 成功 SNS の post URL を全部 (background tab で) 開く。 user は新タブ群を後で
  // 順次見られる。 静かにしたい user は options で 'on-issue' or 'never' に戻せる。
  autoOpenPostUrl: 'always',
  pixivVisibility: 'general',
  pixivAiType: 'notAiGenerated',
  autoLetterboxVerticalVideo: false,
  snsPresets: [],
  // v0.5.6〜 新規 install は 'auto' で起動 (capability 検出して sidepanel/floating/popup を選ぶ)
  displayMode: 'auto',
  uiLanguage: 'auto',
  historyKeepMedia: false,
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

/**
 * 旧仕様 (text + media 全部 storage.session) は session の 10MB quota を
 * 超える動画で media が落ちる regression があった。media は IndexedDB に
 * 逃がして、text 等の小さい state だけ session に置く。
 *
 * - text + 軽量メタ → storage.session (browser 終了で消える、従来通り)
 * - images / video の base64 binary → IndexedDB
 *   (browser 再起動を跨いで残るが、clearDraft で確実に消える)
 */
export async function getDraft(): Promise<Draft | null> {
  const [stored, media] = await Promise.all([
    browser.storage.session.get(DRAFT_KEY),
    getDraftMedia(),
  ]);
  const text = (stored[DRAFT_KEY] as { text?: string } | undefined)?.text;
  if (typeof text !== 'string' && !media) return null;
  return {
    text: text ?? '',
    images: media?.images,
    video: media?.video ?? null,
  };
}

export async function saveDraft(draft: Draft): Promise<void> {
  // text は session storage に (small、browser 終了で消える)
  const textOnly = { text: draft.text };
  const sessionPromise = browser.storage.session.set({ [DRAFT_KEY]: textOnly });

  // media は IndexedDB に (large、quota 緩い、browser 再起動跨いでも残る)
  const hasMedia = (draft.images && draft.images.length > 0) || draft.video;
  const mediaPromise = hasMedia
    ? saveDraftMedia({ images: draft.images, video: draft.video ?? null })
    : clearDraftMedia();

  await Promise.all([sessionPromise, mediaPromise.catch((e) => {
    console.warn('[Tutti] saveDraftMedia (IndexedDB) failed:', e);
  })]);
}

export async function clearDraft(): Promise<void> {
  await Promise.all([
    browser.storage.session.remove(DRAFT_KEY),
    clearDraftMedia(),
  ]);
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

/**
 * 旧 buggy detector が誤って保存した generic label (「Account」 / 「Profile」 等)
 * を識別する RESERVED set。 read 時に filter out + storage からも削除する
 * (lazy migration、 v0.4.98 で追加)。
 */
const RESERVED_BAD_USERNAMES = new Set([
  'account', 'アカウント', '账户', '계정',
  'channel', 'チャンネル', '频道', '채널',
  'profile', 'プロフィール', 'profil',
]);

export async function getLastSeenUsers(): Promise<LastSeenUsers> {
  const stored = await browser.storage.local.get(LAST_SEEN_USERS_KEY);
  const raw = (stored[LAST_SEEN_USERS_KEY] as LastSeenUsers | undefined) ?? {};
  // stale 「Account」 等の generic label を削除して返す (v0.4.98)。
  // 旧 YT detector などが誤検出した値が popup に出続けるのを防ぐ。
  const filtered: LastSeenUsers = {};
  let mutated = false;
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v === 'string' && RESERVED_BAD_USERNAMES.has(v.trim().toLowerCase())) {
      mutated = true;
      continue;
    }
    (filtered as Record<string, string>)[k] = v as string;
  }
  if (mutated) {
    void browser.storage.local.set({ [LAST_SEEN_USERS_KEY]: filtered }).catch(() => { /* ignore */ });
  }
  return filtered;
}

export async function setLastSeenUser(
  platform: PlatformId,
  username: string | null,
): Promise<void> {
  const current = await getLastSeenUsers();
  // v0.4.98: null = clear (REFRESH_USER で detector が検出失敗時、 stale 値を消す)
  if (username === null || username === undefined || username === '') {
    if (!(platform in current)) return;
    const next = { ...current };
    delete next[platform];
    await browser.storage.local.set({ [LAST_SEEN_USERS_KEY]: next });
    return;
  }
  if (current[platform] === username) return;
  await browser.storage.local.set({
    [LAST_SEEN_USERS_KEY]: { ...current, [platform]: username },
  });
}

// ── 投稿履歴 (chrome.storage.local) ─────────────────────────────────────────

/**
 * Per-SNS の投稿結果メタ。 result detail の蓄積場所 (popup の再送 / リンク跳び用)。
 *
 * - `success`: 投稿が SNS 側で landing したか
 * - `url`: post URL (= 「本当に landing した」 証跡。 失敗時は無し)
 * - `error`: 失敗時の文字列メッセージ
 * - `postId`: url から抽出した SNS 固有 ID (v0.5.5〜)。 status check API
 *   で URL より stable に扱える primary key
 */
export interface HistoryPlatformResult {
  success: boolean;
  url?: string;
  error?: string;
  postId?: string;
}

export interface HistoryEntry {
  /**
   * Schema version (v0.5.5〜)。 undefined は legacy (v0)。
   * - v0: textPreview のみ、 hash なし、 postId なし
   * - v1: text (full) + bodyHash + postId 追加、 textPreview は UI 互換のため残置
   */
  version?: 1;
  id: string;
  /** 投稿テキストの先頭 80 文字 (popup 一覧で fast render するため残す)。 */
  textPreview: string;
  /** v1: 投稿の本文 full text (重複検出 / archive 用)。 v0 entry には無し。 */
  text?: string;
  /**
   * v1: 本文 + 添付メディア digest の SHA-256 hex (content addressing)。
   * 同一内容の重複投稿検知 / 履歴 entry の安定識別子。
   */
  bodyHash?: string;
  platforms: PlatformId[];
  results: Partial<Record<PlatformId, HistoryPlatformResult>>;
  hasMedia: boolean;
  /**
   * v1: Settings.historyKeepMedia=ON の時に IndexedDB に保存した media の
   * ID 列。 形式 `${entry.id}-${index}`、 値 7 日後に自動削除。
   */
  mediaRefs?: string[];
  timestamp: number;
}

const HISTORY_KEY = 'postHistory';
const MAX_HISTORY = 20;

export async function getPostHistory(): Promise<HistoryEntry[]> {
  const stored = await browser.storage.local.get(HISTORY_KEY);
  const raw = (stored[HISTORY_KEY] as unknown[] | undefined) ?? [];
  // v0.4.88: 旧 schema (results が boolean だけ) からの lazy migration
  return raw.map((r) => migrateHistoryEntry(r));
}

function migrateHistoryEntry(raw: unknown): HistoryEntry {
  const e = raw as HistoryEntry;
  const firstVal = e.results ? Object.values(e.results)[0] : undefined;
  // 旧 schema: results が boolean だけ → 新 shape に変換
  if (typeof firstVal === 'boolean') {
    const old = e.results as unknown as Partial<Record<PlatformId, boolean>>;
    const migrated: HistoryEntry['results'] = {};
    for (const [k, v] of Object.entries(old)) {
      if (typeof v === 'boolean') migrated[k as PlatformId] = { success: v };
    }
    return { ...e, results: migrated };
  }
  return e;
}

export async function clearPostHistory(): Promise<void> {
  await browser.storage.local.remove(HISTORY_KEY);
}

/** v0.5.9: 個別 entry を削除 (History tab の 🗑 ボタンから)。 */
export async function removeHistoryEntry(id: string): Promise<void> {
  const history = await getPostHistory();
  const next = history.filter((e) => e.id !== id);
  await browser.storage.local.set({ [HISTORY_KEY]: next });
}

export async function addToPostHistory(
  text: string,
  results: PostResultMessage[],
  hasMedia: boolean,
  opts: {
    /** v1: 本文 + media digest を結合した SHA-256 hex (body-hash.ts 経由)。 */
    bodyHash?: string;
    /** v1: 各 SNS の URL から抽出した post ID (post-id.ts 経由)。 */
    postIds?: Partial<Record<PlatformId, string>>;
    /** v1: Settings.historyKeepMedia=ON 時のみ。 IndexedDB 保存済 media の id 列。 */
    mediaRefs?: string[];
  } = {},
): Promise<string> {
  const id = Date.now().toString(36);
  const entry: HistoryEntry = {
    version: 1,
    id,
    textPreview: text.slice(0, 80),
    text,
    bodyHash: opts.bodyHash,
    platforms: results.map((r) => r.platform),
    // v0.4.88: per-SNS の success / url / error を全部保存
    // v0.5.5: postId も保存 (URL より stable な status check 入力)
    results: Object.fromEntries(
      results.map((r) => [
        r.platform,
        {
          success: r.success,
          url: r.url,
          error: r.error,
          postId: opts.postIds?.[r.platform],
        },
      ]),
    ),
    hasMedia,
    mediaRefs: opts.mediaRefs && opts.mediaRefs.length > 0 ? opts.mediaRefs : undefined,
    timestamp: Date.now(),
  };

  const history = await getPostHistory();
  await browser.storage.local.set({
    [HISTORY_KEY]: [entry, ...history].slice(0, MAX_HISTORY),
  });
  return id;
}
