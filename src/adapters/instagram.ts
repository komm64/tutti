import type { PlatformAdapter } from './types';

/**
 * Instagram は home (`/`) で "Create" sidebar link を click すると
 * 多段モーダル wizard が開く:
 *   Modal #1 "Create new post"     (file 選択)
 *     ↓ file inject
 *   Modal #2 "Crop"                (Next で進む)
 *     ↓ Next
 *   Modal #3 "Edit" (filter)       (Next で進む)
 *     ↓ Next
 *   Modal #4 caption + Share       (caption div + Share button で完了)
 *
 * 2026-05-01 probe (scripts/ig-deep-probe.log):
 *   - Create トリガー: text に "New post" / "Create" を含む a/button
 *   - file input: [role="dialog"] input[type="file"]
 *     (accept image/avif,jpeg,png,heic,heif,video/mp4,quicktime, multiple=true)
 *   - Next button: dialog 内 text="Next"
 *   - caption editor: dialog 内 div[contenteditable][aria-label="Write a caption..."]
 *   - Share button: dialog 内 text="Share"
 */
export const instagramAdapter: PlatformAdapter = {
  id: 'instagram',
  name: 'Instagram',
  // caption 上限 2200 (probe で "0/2,200" と表示されてた)
  charLimit: 2200,
  matchUrl: (url) => /^https:\/\/(www\.)?instagram\.com\//.test(url),
  // home から Create ボタンを click する flow なので、compose URL は home に
  getComposeUrl: () => 'https://www.instagram.com/',
  prefillsViaUrl: false,
  videoConstraints: {
    // Reels の制約は別 (この adapter は Post/Feed 専用)。Feed video は 60s 程度
    maxDurationS: 60,
    maxBytes: 100 * 1024 * 1024,
  },
  imageConstraints: {
    maxBytesPerImage: 30 * 1024 * 1024,
    // IG は単一投稿で carousel に最大 10 枚
    maxImages: 10,
  },
  // text-only 不可、画像 + 短尺動画
  kinds: ['image', 'shortVideo'],
  // IG は超重 SPA + 4 段 modal wizard。background tab で動かすのは無理
  requiresForegroundTab: true,
};

export const INSTAGRAM_SELECTORS = {
  /**
   * Modal #1 の file input。aria-label は付いてない、dialog 内の唯一の type=file。
   * accept がイメージ/動画混在なので accept フィルタは雑にしておく。
   */
  fileInput: '[role="dialog"] input[type="file"]',
  /**
   * caption editor: lexical-style contenteditable div。aria-label が言語ごとに
   * 変わるので複数 locale を試す + 最後に aria-label 無し contenteditable へ
   * フォールバック。selector override (docs/selectors.json) で更に追加可能。
   */
  captionEditor:
    '[role="dialog"] div[contenteditable="true"][aria-label="Write a caption..."],' +
    '[role="dialog"] div[contenteditable="true"][aria-label="キャプションを書く..."],' +
    '[role="dialog"] div[contenteditable="true"][aria-label*="caption" i],' +
    '[role="dialog"] div[contenteditable="true"][aria-label*="キャプション"]',
} as const;
