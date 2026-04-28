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
};

export const BLUESKY_SELECTORS = {
  /** 投稿ボタン(aria-label 経由が最も安定) */
  postButton: '[aria-label="Publish post"], [data-testid="composerPublishBtn"]',
  /** 投稿入力欄(fallback 用) */
  textarea: '[contenteditable="true"][role="textbox"]',
} as const;
