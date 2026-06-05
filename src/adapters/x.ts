import type { PlatformAdapter } from './types';

export const xAdapter: PlatformAdapter = {
  id: 'x',
  name: 'X',
  charLimit: 280,
  matchUrl: (url) => /^https:\/\/(x|twitter)\.com\//.test(url),
  /**
   * X は `/compose/post` の modal compose を使う。ホームの inline compose は
   * 画面幅やタイムライン状態で描画されないことがあるため、実投稿の入口として
   * 安定しない。
   */
  getComposeUrl: () => 'https://x.com/compose/post',
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
