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
   * studio.youtube.com の "Create" → "Upload videos" でモーダルが開き、
   * 内部に file input がある。selector は probe 後に確定 (今は推測ベース)。
   */
  fileInput: 'input[type="file"][accept*="video"]#file-loader, input[type="file"][accept*="video"]',
  /** title input (required)、modal 内に出る */
  titleInput: 'input[id="textbox"][aria-label*="title" i], textarea[id="textbox"][aria-label*="title" i]',
  /** description: title と同じ "textbox" 系の contenteditable */
  descriptionEditor: '#description-textarea #textbox, [aria-label*="description" i][contenteditable="true"]',
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
