import type { PlatformAdapter } from './types';

// X can finish the upload request while its server-side video processing is
// still at 98%. Keep waiting in the same composer instead of reattaching the
// file, which could create duplicate uploads or posts.
export const X_VIDEO_MEDIA_READY_TIMEOUT_MS = 600_000;

export const xAdapter: PlatformAdapter = {
  id: 'x',
  name: 'X',
  charLimit: 280,
  popupOrder: 1,
  defaultSelected: true,
  mediaRetryPolicy: 'single-attempt',
  previewLane: 'foreground',
  matchUrl: (url) => /^https:\/\/(x|twitter)\.com\//.test(url),
  /**
   * Let X initialize its own controlled editor state through the official
   * intent route. The content script still verifies the exact draft and fills
   * it only when X did not preserve the prefill.
   */
  getComposeUrl: (text) => text
    ? `https://x.com/intent/post?text=${encodeURIComponent(text)}`
    : 'https://x.com/compose/post',
  getLoginUrl: () => 'https://x.com/',
  prefillsViaUrl: false,
  videoConstraints: {
    // X 無料層は 2m20s (= 140s)、 Premium で 4h まで。 default は free tier 値で
    // 早期 reject させる (= 140s 超を user に知らせる)。 Premium user は
    // selectorOverrideUrl の _videoConstraints.x.maxDurationS で override 可能。
    maxDurationS: 140,
    // 無料層 512MB、 Premium 8-16GB。 default は free tier 値。
    maxBytes: 512 * 1024 * 1024,
  },
  imageConstraints: {
    maxBytesPerImage: 5 * 1024 * 1024, // 5MB
    maxImages: 4,
  },
  kinds: ['text', 'image', 'shortVideo', 'longVideo'],
};

export const X_SELECTORS = {
  /** modal compose を優先し、背後の home compose に誤注入しない */
  textarea: '[role="dialog"] [data-testid="tweetTextarea_0"][role="textbox"], [role="dialog"] [data-testid="tweetTextarea_0"][contenteditable="true"], [data-testid="tweetTextarea_0"][role="textbox"], [data-testid="tweetTextarea_0"][contenteditable="true"]',
  /** ホーム画面の inline compose の Post ボタン */
  postButtonInline: '[data-testid="tweetButtonInline"]',
  /** modal compose の Post ボタン (fallback) */
  postButton: '[data-testid="tweetButton"]',
  /** 画像添付の hidden file input */
  fileInput: '[role="dialog"] input[data-testid="fileInput"], main input[data-testid="fileInput"], input[data-testid="fileInput"]',
} as const;
