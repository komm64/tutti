import type { PlatformAdapter } from './types';

/**
 * YouTube Shorts upload via studio.youtube.com。
 *
 * 重要: YouTube アカウント (Google アカウント) に **チャンネル** が
 * 作成されてないと upload page にアクセスできず、www.youtube.com/ に
 * redirect されて "Create channel" CTA が出る。
 * Tutti を使う前にユーザがチャンネル作成しておく必要がある (Settings 等で
 * 案内予定)。
 *
 * 2026-05-02 probe (scripts/youtube-probe.log): test アカウントは未作成
 * のため redirect された。実 upload page の DOM probe は user channel
 * 作成後に実施する。
 *
 * upload flow (公開仕様 + 一般的な YouTube Studio):
 *   1. studio.youtube.com → Create button (動画アイコン) → upload modal
 *   2. file input (mp4/mov) inject → upload 開始
 *   3. metadata: title (required) / description (optional) / 子供向け選択 (required)
 *   4. visibility (公開/限定公開/非公開) → Publish
 *
 * Tutti は kinds=['shortVideo']。Shorts (60s 以下、9:16) を想定。
 */
export const youtubeAdapter: PlatformAdapter = {
  id: 'youtube',
  name: 'YouTube',
  // description 上限 5000
  charLimit: 5000,
  // studio.youtube.com / m.youtube.com / www.youtube.com
  matchUrl: (url) => /^https:\/\/((www|m|studio)\.)?youtube\.com\//.test(url),
  getComposeUrl: () => 'https://studio.youtube.com/',
  prefillsViaUrl: false,
  videoConstraints: {
    // Shorts: 60s 以下推奨、Tutti は 60s で打ち切り (本格 vlog は別 SNS)
    maxDurationS: 60,
    maxBytes: 2 * 1024 * 1024 * 1024, // 2GB (YouTube は 256GB だが Tutti は実用範囲)
  },
  imageConstraints: {
    maxBytesPerImage: 0,
    maxImages: 0,
  },
  kinds: ['shortVideo'],
  requiresForegroundTab: true,
};

export const YOUTUBE_SELECTORS = {
  /**
   * Upload videos ボタン click で開く upload modal 内の file input。
   * `#ytcp-uploads-dialog-file-picker` (custom element) 内に input[type=file][name="Filedata"]。
   * accept 属性はなし (any file 受け入れる、サーバ側で video 判定)。
   */
  fileInput: '#ytcp-uploads-dialog-file-picker input[type="file"], input[type="file"][name="Filedata"]',
  /**
   * title 入力欄。実機 DOM は <div id="textbox" contenteditable> で、aria-label が
   * "Add a title that describes your video..." (英語) / 言語依存。aria-label に
   * "title" を含むかどうかで判別。
   */
  titleInput: 'div[id="textbox"][contenteditable="true"][aria-label*="title" i], div[id="textbox"][contenteditable="true"][aria-label*="タイトル" i]',
  /**
   * description 入力欄。同じく div#textbox contenteditable。aria-label は
   * "Tell viewers about your video..." (英語) など、"viewers" や "video" 含むが
   * "description" は含まない。description 用は **2 つ目の textbox** (DOM 順)。
   * finder の方が確実なので content script 側で 2 つ目の textbox を取る。
   */
  descriptionEditor: 'div[id="textbox"][contenteditable="true"]:not([aria-label*="title" i]):not([aria-label*="タイトル" i])',
  /**
   * "Made for Kids" の "No" ラジオ。Details 段階の必須項目で、未選択だと
   * Next が disabled。Tutti は default で No (Not made for kids) を選択。
   */
  notMadeForKidsRadio: 'tp-yt-paper-radio-button[name="VIDEO_MADE_FOR_KIDS_NOT_MFK"]',
  /**
   * Visibility wizard 段階の "Public" radio。これを選ばないと default の
   * Private で publish される (= 投稿者しか見られない)。Tutti は cross-post
   * 用なので default Public が望ましい。R-18 等は別 SNS で対応する想定。
   */
  publicVisibilityRadio: 'tp-yt-paper-radio-button[name="PUBLIC"]',
  /** Next / Publish ボタン (text マッチで finder) */
  publishButton: '#done-button, ytcp-button[role="button"]',
} as const;

/**
 * YouTube title は 100 char 上限。本文の 1 行目から切る。
 */
export function buildYouTubeTitle(text: string): string {
  const firstLine = text.split('\n')[0]?.trim() ?? '';
  return firstLine.slice(0, 100) || 'Untitled';
}
