import type { PlatformAdapter } from './types';

export const blueskyAdapter: PlatformAdapter = {
  id: 'bluesky',
  name: 'Bluesky',
  charLimit: 300,
  matchUrl: (url) => /^https:\/\/bsky\.app\//.test(url),
  // /intent/compose?text= で compose dialog が開いて text が入る
  getComposeUrl: (text) =>
    `https://bsky.app/intent/compose?text=${encodeURIComponent(text)}`,
  getLoginUrl: () => 'https://bsky.app/',
  prefillsViaUrl: true,
  videoConstraints: {
    // Bluesky は 2024 年に 60s → 180s (3 min) に上限を緩和済。
    maxDurationS: 180,
    // Bluesky UI 上の「100MB」は SI MB (= 100,000,000 bytes) で、 100 * 1024 * 1024
    // (= 104.86 MB SI) は超過する。さらに ffmpeg ultrafast preset は target bitrate
    // を 10-20% overshoot しがち。これらマージンを取って **80 MiB** に設定。
    // 80 MiB ≈ 83.9 MB SI で、20% overshoot しても 100 MB SI の Bluesky cap に
    // 余裕で収まる。getUploadLimits API probe (P17) で実値が取れたらそちらを優先。
    maxBytes: 80 * 1024 * 1024,
  },
  imageConstraints: {
    // atproto lex `app.bsky.embed.images` の `maxSize: 2000000` に従う
    // (旧 1MB は 2026 以前。 現行 spec で 2MB に緩和、 description に
    // "formerly limited to 1 MB" と明記)。 decimal 値で揃える。
    maxBytesPerImage: 2_000_000,
    maxImages: 4,
  },
  // Bluesky は 180s まで対応 (2024 緩和)。 boundary 60s 超は longVideo 扱いに
  // なるため shortVideo + longVideo の両方を入れる。 上限 180s は
  // videoConstraints.maxDurationS で別途バウンド。
  kinds: ['text', 'image', 'shortVideo', 'longVideo'],
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
