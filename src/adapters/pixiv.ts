import type { PlatformAdapter } from './types';

/**
 * Pixiv はイラスト/漫画投稿に特化したクリエイター向けプラットフォーム。
 * `/illustration/create` (旧 `/upload.php` も同じ URL に redirect) は
 * 「単一ページの長い form」(image select + title + caption + tags)。
 * wizard ではないが、複数フィールドを順次埋める必要があるので
 * step-runner.ts の executeMultiStepFlow を流用する (step.advance なし)。
 *
 * 設計上の決定:
 *   - text → title + caption に分割: 1 行目 (40 chars 上限) を title、全体を caption
 *   - 画像必須 (Pixiv は画像なしで投稿不可)、kinds = ['image'] のみ
 *   - **tags は必須** (実機検証 2026-05-02、Required ラベル付き)。本文中の
 *     `#tag` を抽出 (1〜10 個)、無ければ default ['Tutti'] を使う
 *   - charLimit は caption の実用上限。Pixiv 側は事実上無制限だが、
 *     クロスポスト元 SNS の text を全部突っ込んで違和感ない範囲として 1000 を選択
 *
 * 2026-05-01 の probe 結果 (scripts/pixiv-probe.log):
 *   - file input: input[name="files[]"] (hidden, multiple, accept=image/gif|jpeg|png)
 *   - title: input[name="title"]
 *   - caption: textarea[name="comment"]
 *   - post button: .gtm-work-post-button-in-header-click (header, 常時 enabled)
 */
export const pixivAdapter: PlatformAdapter = {
  id: 'pixiv',
  name: 'Pixiv',
  // caption 実用上限。Pixiv 側は無制限だが、超過警告を出すボーダーとして
  charLimit: 1000,
  matchUrl: (url) => /^https:\/\/(www\.)?pixiv\.net\//.test(url),
  getComposeUrl: () => 'https://www.pixiv.net/illustration/create',
  prefillsViaUrl: false,
  imageConstraints: {
    // Pixiv は 1 枚 30MB / 200 枚まで。ただし実用上は 10 枚程度に絞ったほうが
    // クロスポスト先の Pixiv オーディエンスに合う (multi-page illustrations は別文脈)
    maxBytesPerImage: 30 * 1024 * 1024,
    maxImages: 200,
  },
  // Pixiv は画像必須なので text のみ投稿は不可。kinds から 'text' を除外
  kinds: ['image'],
  // Pixiv は heavy SPA + 多段 form。background tab だと React state / file
  // upload が throttle されて極端に遅くなる (実機 2026-05-02 確認)。foreground 必須
  requiresForegroundTab: true,
};

export const PIXIV_SELECTORS = {
  /** 画像 file input。hidden=true なので setter 経由で files を注入 */
  fileInput: 'input[type="file"][name="files[]"][accept*="image"]',
  /** タイトル input (required) */
  titleInput: 'input[name="title"]',
  /** caption textarea (optional) */
  captionTextarea: 'textarea[name="comment"]',
  /** tag input (required)。Enter で 1 tag 確定 → input がクリアされて次が打てる */
  tagInput: 'input[placeholder="Tags"][maxlength="30"]',
  /**
   * Visible to (x_restrict) radio group の "All ages" ボタン。
   * 必須項目だが Pixiv はデフォルト未選択。Tutti は General (All ages) を強制。
   * 値: general / r18 / r18g
   */
  visibilityAllAges: 'input[type="radio"][name="x_restrict"][value="general"]',
  /**
   * AI-generated work (ai_type) の "No" radio。必須項目、デフォルト未選択。
   * Tutti は notAiGenerated を強制 (AI artist の場合は将来 settings で切替予定)。
   */
  aiTypeNo: 'input[type="radio"][name="ai_type"][value="notAiGenerated"]',
  /**
   * 投稿ボタン。header の Post (gtm-work-post-button-in-header-click) は
   * 常時 enabled だが、画像 + title が無いとサーバ側で弾かれる。
   * 画像 inject + title 入力後に click する。
   */
  postButton: '.gtm-work-post-button-in-header-click, button.charcoal-button[type="submit"]',
} as const;

/**
 * Pixiv の title は実用 32〜40 文字程度が表示で切れない上限。
 * クロスポスト時は text の 1 行目から取り、空ならデフォルト名にする。
 */
export function buildPixivTitle(text: string): string {
  const firstLine = text.split('\n')[0]?.trim() ?? '';
  const truncated = firstLine.slice(0, 40);
  return truncated || 'Untitled';
}

/**
 * 本文から hashtag (`#word`) を抽出して Pixiv tag 配列にする。
 * - max 10 個 (Pixiv 上限)
 * - 各 30 char 以内に切る (input maxlength)
 * - 先頭 # は剥がす
 * - 0 個なら ['Tutti'] を default として返す (Pixiv は tag 必須なので何か入れる)
 */
export function extractPixivTags(text: string): string[] {
  const matches = text.match(/(?:^|\s|\b)#([\p{L}\p{N}_]{1,30})/gu) ?? [];
  const tags: string[] = [];
  const seen = new Set<string>();
  for (const m of matches) {
    const clean = m.replace(/^[\s]*#/, '').slice(0, 30);
    if (!clean || seen.has(clean.toLowerCase())) continue;
    seen.add(clean.toLowerCase());
    tags.push(clean);
    if (tags.length >= 10) break;
  }
  return tags.length > 0 ? tags : ['Tutti'];
}
