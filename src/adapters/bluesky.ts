import type { PlatformAdapter } from './types';

export const blueskyAdapter: PlatformAdapter = {
  id: 'bluesky',
  name: 'Bluesky',
  charLimit: 300,
  matchUrl: (url) => /^https:\/\/bsky\.app\//.test(url),
  // /intent/compose?text= で compose dialog が開いて text が入る
  getComposeUrl: (text) =>
    `https://bsky.app/intent/compose?text=${encodeURIComponent(text)}`,
  prefillsViaUrl: true,
  videoConstraints: {
    maxDurationS: 60,
    maxBytes: 50 * 1024 * 1024,
  },
  imageConstraints: {
    maxBytesPerImage: 1024 * 1024, // 1MB(Bluesky は厳しい)
    maxImages: 4,
  },
  // 60s 上限のため shortVideo まで
  kinds: ['text', 'image', 'shortVideo'],
};

export const BLUESKY_SELECTORS = {
  /** 投稿ボタン(aria-label 経由が最も安定) */
  postButton: '[aria-label="Publish post"], [data-testid="composerPublishBtn"]',
  /** 投稿入力欄(fallback 用) */
  textarea: '[contenteditable="true"][role="textbox"]',
  /**
   * 画像添付の drop target。Bluesky は「Add image」ボタンから OS picker が
   * 直接開くので file input が DOM に出てこない。compose の textbox に
   * drop を dispatch すると React が反応してプレビュー表示する(2026-04-30 検証)。
   */
  dropTarget: '[contenteditable="true"][role="textbox"], [data-testid="composer"]',
} as const;
