import type { PlatformAdapter } from './types';

/**
 * Threads は Meta が運営。intent URL の text pre-fill は Unicode の非BMP文字を
 * U+FFFD に置換するため、空の composer を開いて MAIN world から本文を注入する。
 * 投稿ボタンの DOM は React Native Web ベースで頻繁に変わる可能性がある。
 */
export const threadsAdapter: PlatformAdapter = {
  id: 'threads',
  name: 'Threads',
  charLimit: 500,
  popupOrder: 3,
  defaultSelected: true,
  // 2025 以降 threads.com に段階移行中。両ドメインを許容
  matchUrl: (url) => /^https:\/\/www\.threads\.(?:net|com)\//.test(url),
  // 新ドメイン threads.com の空 composer を使う(threads.net は redirect 想定)。
  getComposeUrl: () => 'https://www.threads.com/intent/post',
  getLoginUrl: () => 'https://www.threads.com/',
  prefillsViaUrl: false,
  videoConstraints: {
    // Threads supports video posts on web. Keep the platform enabled, but rely
    // on post-submit verification to catch the previous text-only failure mode.
    maxDurationS: 300,
    maxBytes: 1024 * 1024 * 1024, // 1GB
  },
  imageConstraints: {
    maxBytesPerImage: 8 * 1024 * 1024, // 8MB
    maxImages: 10,
  },
  kinds: ['text', 'image', 'shortVideo', 'longVideo'],
};

export const THREADS_SELECTORS = {
  /** 投稿ボタン: aria-label / data-pressable-container 経由のフォールバック群 */
  postButton: '[aria-label="Post"], [aria-label="投稿"], div[role="button"][data-pressable-container="true"]',
  /**
   * intent composer の dialog 内に限定する。ホーム画面背後にも同型の textbox が
   * 存在し、汎用 selector では非表示側へ本文を注入してしまう。
   */
  textarea:
    '[role="dialog"] div[contenteditable="true"][role="textbox"],' +
    '[role="dialog"] div[contenteditable="plaintext-only"],' +
    '[role="alertdialog"] div[contenteditable="true"][role="textbox"],' +
    '[role="alertdialog"] div[contenteditable="plaintext-only"]',
  /** 画像添付用 file input */
  fileInput:
    '[role="dialog"] input[type="file"][accept*="video"],' +
    '[role="dialog"] input[type="file"][accept*="image"],' +
    '[role="dialog"] input[type="file"],' +
    'input[type="file"][accept*="video"],' +
    'input[type="file"][accept*="image"],' +
    'input[type="file"]',
  /** Current Threads Web accepts media through drop on the compose textbox. */
  dropTarget: '[role="dialog"] [role="textbox"]',
} as const;
