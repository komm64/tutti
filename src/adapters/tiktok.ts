import type { PlatformAdapter } from './types';

export const TIKTOK_EMPTY_CAPTION_SENTINEL = '\u200B';

/**
 * TikTok web upload (TikTok Studio)。/tiktokstudio/upload で動画 only。
 * 2024 年に "Photo Mode" が追加されたが Web は依然 video-first。
 *
 * 2026-05-02 probe (scripts/tiktok-probe.log + tiktok-deep-probe.log):
 *   - URL: https://www.tiktok.com/tiktokstudio/upload
 *   - file input: input[type="file"][accept="video/*"] (multiple=false, hidden)
 *   - "Select video" ボタン (aria="Select video") の隣に hidden input
 *   - 動画選択 → 自動で upload 開始 → caption form mount
 *   - caption は動画選択後に出現する contenteditable
 *
 * Tutti は動画必須の SNS として扱う。kinds=['shortVideo']。
 * 画像 (TikTok Photo Mode) は将来 v0.5+ で別 flow として追加する。
 */
export const tiktokAdapter: PlatformAdapter = {
  id: 'tiktok',
  name: 'TikTok',
  // caption 上限 2200 (2024 から 4000 に増えた説もあるが確証なし、安全側で 2200)
  charLimit: 2200,
  matchUrl: (url) => /^https:\/\/(www\.)?tiktok\.com\//.test(url),
  getComposeUrl: () => 'https://www.tiktok.com/tiktokstudio/upload',
  getLoginUrl: () => 'https://www.tiktok.com/',
  prefillsViaUrl: false,
  videoConstraints: {
    // TikTok web は最大 60 分まで上げられるが実用 3 分。Tutti は短尺メイン
    maxDurationS: 180,
    maxBytes: 287 * 1024 * 1024, // 287MB (TikTok web upper)
  },
  imageConstraints: {
    // 画像 (Photo Mode) は別 flow なので Web upload には乗せない
    maxBytesPerImage: 0,
    maxImages: 0,
  },
  // 短尺動画のみ。text-only も image も不可
  kinds: ['shortVideo'],
  // TikTok Studio は heavy SPA + 多段 upload + caption mount。foreground 必須
  requiresForegroundTab: true,
};

export const TIKTOK_SELECTORS = {
  /**
   * 動画 file input (hidden)。tiktokstudio/upload の "Select video" ボタンの隣にある
   * input[type=file][accept=video/*]。Pixiv 同様 setter で files を入れると React が
   * 反応して upload 開始 + caption form mount。
   */
  fileInput:
    'input[type="file"][accept*="video"], ' +
    'input[type="file"][accept*="mp4"], ' +
    'input[type="file"]:not([accept*="image"])',
  /**
   * caption editor。TikTok Studio は Draft.js (Facebook の rich text editor) を使う。
   * `.public-DraftEditor-content` がエディタ本体 (`contenteditable=true`、role=combobox)。
   * aria-label は付いてない、class が固定ID。動画選択後に現れる。
   */
  captionEditor: '.public-DraftEditor-content[contenteditable="true"], .DraftEditor-editorContainer [contenteditable="true"]',
  /**
   * Post button。caption 入力後に enable。テキスト "Post" / "投稿" / "公開"。
   */
  postButton: 'button[type="submit"], button[data-e2e*="post" i]',
} as const;

/**
 * TikTok caption 用の text 整形。先頭 2200 文字に切る。
 * hashtag は本文中に含まれていればそのまま (TikTok は hashtag を本文中で使う)。
 */
export function buildTikTokCaption(text: string): string {
  const caption = text.slice(0, 2200);
  return caption.length > 0 ? caption : TIKTOK_EMPTY_CAPTION_SENTINEL;
}
