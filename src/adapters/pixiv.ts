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
  getLoginUrl: () => 'https://www.pixiv.net/',
  prefillsViaUrl: false,
  imageConstraints: {
    // Pixiv 公式上限は 1 枚 32MB (公式 help: "Are there any limits on image file size?")。
    // post 全体で 200MB 上限あり (今は per-image しか check しない、 multi-image
    // の累計はクロスポスト用途では超えにくいので skip)。
    maxBytesPerImage: 32 * 1024 * 1024,
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
   * Visible to (x_restrict) radio group。 必須項目だが Pixiv default 未選択。
   * Tutti は Settings.pixivVisibility ('general' default) で切替。
   * 値: general / r18 / r18g
   */
  visibilityAllAges: 'input[type="radio"][name="x_restrict"][value="general"]',
  visibilityR18: 'input[type="radio"][name="x_restrict"][value="r18"]',
  visibilityR18g: 'input[type="radio"][name="x_restrict"][value="r18g"]',
  /**
   * AI-generated work (ai_type) radio。 必須項目、 default 未選択。
   * Tutti は Settings.pixivAiType ('notAiGenerated' default) で切替。
   */
  aiTypeNo: 'input[type="radio"][name="ai_type"][value="notAiGenerated"]',
  aiTypeYes: 'input[type="radio"][name="ai_type"][value="aiGenerated"]',
  /**
   * Adult content (sexual) の "No" radio。必須項目、デフォルト未選択。
   * クロスポスト content は基本 non-sexual なので false (No) を default。
   * R-18 投稿者向けは将来 settings で切替予定。
   */
  sexualNo: 'input[type="radio"][name="sexual"][value="false"]',
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
 * - 0 個なら空配列を返す (v0.4.93〜: 旧 default `['Tutti']` は user 意図と無関係に
 *   勝手に注入する anti-feature だったので廃止。 user が空 caption で投稿しようと
 *   する場合は Pixiv 側で tag を要求されるので user が compose 画面で入れる)
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
  return tags;
}

/**
 * Pixiv caption から hashtag (`#word`) を取り除く。
 * Pixiv は caption 内 `#word` を auto-link しないので、tags フィールドに
 * 移したら caption からは消す方が自然 (= 「#anime #fanart」が caption 末尾
 * に残るだけになるので)。前後の空白も整理。
 */
export function stripHashtagsForPixivCaption(text: string): string {
  return text
    .replace(/(?:^|\s)#[\p{L}\p{N}_]{1,30}/gu, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
