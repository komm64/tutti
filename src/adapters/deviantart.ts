import type { PlatformAdapter } from './types';

/**
 * DeviantArt は wizard 型 upload UI:
 *   /studio?new=1 → "Deviation" タイル click → upload modal が立ち上がり
 *   image inject → metadata 形 (title + description) が出現 → Next → Submit。
 *
 * 2026-05-01 probe (scripts/da-with-image-probe.log) で確認:
 *   - Deviation タイル: button text "Deviation"
 *   - upload file input: input[type=file][accept="image/jpg,image/jpeg,image/png,image/gif"]
 *     multiple=false (DA は 1 deviation = 1 image)
 *   - title: input[name="title"][placeholder="Add your title here"] (in dialog)
 *   - description: div.tiptap.ProseMirror (TipTap rich text editor、contenteditable)
 *   - Next: button[aria-label="Next"]
 *   - Submit: 末尾 button text="Submit" class="reset-button gXsyN5"
 */
export const deviantartAdapter: PlatformAdapter = {
  id: 'deviantart',
  name: 'DeviantArt',
  // DA description は generous (5000 程度の感覚)。実用上限としてセット
  charLimit: 5000,
  matchUrl: (url) => /^https:\/\/(www\.)?deviantart\.com\//.test(url),
  getComposeUrl: () => 'https://www.deviantart.com/studio?new=1',
  prefillsViaUrl: false,
  imageConstraints: {
    maxBytesPerImage: 30 * 1024 * 1024,
    // DA は 1 deviation = 1 image (file input multiple=false)
    maxImages: 1,
  },
  kinds: ['image'],
  // DA も heavy SPA + wizard。Pixiv 同様 foreground tab が必須
  requiresForegroundTab: true,
};

export const DEVIANTART_SELECTORS = {
  /**
   * 画像 file input。/studio?new=1 chooser ページの "Deviation" タイル内に
   * 元から存在する hidden input (multiple=true, accept=image/jpg,jpeg,png)。
   * これに files を setter 経由でセットすると DA の React が反応して
   * upload modal を開く + サーバ upload + metadata form の mount を行う。
   * (tile を click してから modal 内 input を狙うルートもあるが、ここで一発で起動できる)
   */
  fileInput: 'button input[type="file"][accept*="image/png"][multiple]',
  /** タイトル input。dialog 内に出る */
  titleInput: 'input[name="title"]',
  /**
   * description editor。DA は TipTap (ProseMirror) ベースだが class が頻繁に
   * 変わるので多段 selector。aria-label / placeholder 経由の fallback も。
   * docs/selectors.json override で更に追加可能。
   */
  descriptionEditor:
    'div.tiptap.ProseMirror[contenteditable="true"],' +
    'div.ProseMirror[contenteditable="true"],' +
    '[contenteditable="true"][aria-label*="description" i],' +
    '[contenteditable="true"][aria-placeholder*="description" i],' +
    '[contenteditable="true"][aria-placeholder*="story" i],' +
    'main [contenteditable="true"]:not([role="combobox"])',
  /** Next button: 次ページ (categorization 画面) へ進む */
  nextButton: 'button[aria-label="Next"]',
  /**
   * 最終 Submit。chooser タイルにも "Submit" があるので、 DOM 順で末尾を取りたい。
   * `:scope` 等は現実的な fallback として content script 側で last 要素を選ぶ
   */
  submitButton: 'button[type="submit"], button.reset-button.gXsyN5',
} as const;

/**
 * DA の title は実用 50 文字程度。text の 1 行目を取って切る。
 */
export function buildDeviantArtTitle(text: string): string {
  const firstLine = text.split('\n')[0]?.trim() ?? '';
  return firstLine.slice(0, 50) || 'Untitled';
}
