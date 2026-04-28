import type { PlatformAdapter } from './types';

/**
 * Threads は Meta が運営。intent URL で text pre-fill が可能。
 * 投稿ボタンの DOM は React Native Web ベースで頻繁に変わる可能性がある。
 */
export const threadsAdapter: PlatformAdapter = {
  id: 'threads',
  name: 'Threads',
  charLimit: 500,
  matchUrl: (url) => /^https:\/\/www\.threads\.net\//.test(url),
  // /intent/post?text= で compose dialog が開いて text が入る
  getComposeUrl: (text) =>
    `https://www.threads.net/intent/post?text=${encodeURIComponent(text)}`,
  prefillsViaUrl: true,
  videoConstraints: {
    maxDurationS: 300, // 5 分
    maxBytes: 1024 * 1024 * 1024, // 1GB
  },
  imageConstraints: {
    maxBytesPerImage: 8 * 1024 * 1024, // 8MB
    maxImages: 10,
  },
};

export const THREADS_SELECTORS = {
  /** 投稿ボタン: aria-label / data-pressable-container 経由のフォールバック群 */
  postButton: '[aria-label="Post"], [aria-label="投稿"], div[role="button"][data-pressable-container="true"]',
  /** 投稿入力欄(fallback 用) */
  textarea: 'div[contenteditable="true"][role="textbox"], div[contenteditable="plaintext-only"]',
  /** 画像添付用 file input */
  fileInput: 'input[type="file"][accept*="image"], input[type="file"]',
} as const;
