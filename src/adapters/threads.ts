import type { PlatformAdapter } from './types';

/**
 * Threads は Meta が運営。intent URL で text pre-fill が可能。
 * 投稿ボタンの DOM は React Native Web ベースで頻繁に変わる可能性がある。
 */
export const threadsAdapter: PlatformAdapter = {
  id: 'threads',
  name: 'Threads',
  charLimit: 500,
  // 2025 以降 threads.com に段階移行中。両ドメインを許容
  matchUrl: (url) => /^https:\/\/www\.threads\.(?:net|com)\//.test(url),
  // 新ドメイン threads.com の intent を使う(threads.net は redirect 想定)
  getComposeUrl: (text) =>
    `https://www.threads.com/intent/post?text=${encodeURIComponent(text)}`,
  getLoginUrl: () => 'https://www.threads.com/',
  prefillsViaUrl: true,
  imageConstraints: {
    maxBytesPerImage: 8 * 1024 * 1024, // 8MB
    maxImages: 10,
  },
  // 2026-06: Threads Web accepted the injected video path but published a
  // text-only post in Surface verification. Disable video until the web flow
  // can prove the media survives the published post.
  kinds: ['text', 'image'],
};

export const THREADS_SELECTORS = {
  /** 投稿ボタン: aria-label / data-pressable-container 経由のフォールバック群 */
  postButton: '[aria-label="Post"], [aria-label="投稿"], div[role="button"][data-pressable-container="true"]',
  /** 投稿入力欄(fallback 用) */
  textarea: 'div[contenteditable="true"][role="textbox"], div[contenteditable="plaintext-only"]',
  /** 画像添付用 file input */
  fileInput:
    '[role="dialog"] input[type="file"][accept*="image"],' +
    '[role="dialog"] input[type="file"],' +
    'input[type="file"][accept*="image"],' +
    'input[type="file"]',
  /** Current Threads Web accepts media through drop on the compose textbox. */
  dropTarget: '[role="dialog"] [role="textbox"]',
} as const;
