import type { PlatformAdapter } from './types';

export const xAdapter: PlatformAdapter = {
  id: 'x',
  name: 'X',
  charLimit: 280,
  matchUrl: (url) => /^https:\/\/(x|twitter)\.com\//.test(url),
  // /intent/tweet?text= で URL pre-fill が効く(twitter.com 互換 URL)
  getComposeUrl: (text) =>
    `https://x.com/intent/tweet?text=${encodeURIComponent(text)}`,
  prefillsViaUrl: true,
  videoConstraints: {
    // X は無料層 2m20s だったが 2024 以降緩和、Premium で更に長い、と
    // 流動的なのでクライアント側で尺チェックしない。超過時は X 側で拒否される。
    maxDurationS: 0,
    maxBytes: 512 * 1024 * 1024,
  },
  imageConstraints: {
    maxBytesPerImage: 5 * 1024 * 1024, // 5MB
    maxImages: 4,
  },
  kinds: ['text', 'image', 'shortVideo', 'longVideo'],
};

export const X_SELECTORS = {
  /** 投稿入力欄(intent 経由でも DOM injection fallback 用に保持) */
  textarea: '[data-testid="tweetTextarea_0"]',
  /** 投稿ボタン(modal 形式) */
  postButton: '[data-testid="tweetButton"]',
  /** 投稿ボタン(inline 形式、ホーム画面の上部 compose) */
  postButtonInline: '[data-testid="tweetButtonInline"]',
  /** 画像添付用 hidden file input */
  fileInput: 'input[data-testid="fileInput"]',
} as const;
