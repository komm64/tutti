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
    // Bluesky UI 上の「100MB」は SI MB (= 100,000,000 bytes) で、 100 * 1024 * 1024
    // (= 104.86 MB SI) は超過する。さらに ffmpeg ultrafast preset は target bitrate
    // を 10-20% overshoot しがち。これらマージンを取って **80 MiB** に設定。
    // 80 MiB ≈ 83.9 MB SI で、20% overshoot しても 100 MB SI の Bluesky cap に
    // 余裕で収まる。getUploadLimits API probe (P17) で実値が取れたらそちらを優先。
    maxBytes: 80 * 1024 * 1024,
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
