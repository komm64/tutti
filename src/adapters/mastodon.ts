import type { PlatformAdapter } from './types';

/**
 * Mastodon は federated なのでインスタンス URL がユーザーごとに違う。
 * v1 ではデフォルト mastodon.social にハードコード、ユーザー設定での
 * インスタンス URL 切り替えは P8 (設定画面) で対応予定。
 */
export const MASTODON_DEFAULT_INSTANCE = 'https://mastodon.social';

export const mastodonAdapter: PlatformAdapter = {
  id: 'mastodon',
  name: 'Mastodon',
  charLimit: 500,
  matchUrl: (url) => url.startsWith(`${MASTODON_DEFAULT_INSTANCE}/`),
  // /share?text= で compose modal が開く(多くの Mastodon インスタンスで共通)
  getComposeUrl: (text) =>
    `${MASTODON_DEFAULT_INSTANCE}/share?text=${encodeURIComponent(text)}`,
  getLoginUrl: () => MASTODON_DEFAULT_INSTANCE,
  prefillsViaUrl: true,
  videoConstraints: {
    maxDurationS: 0, // インスタンス依存、チェックしない
    maxBytes: 40 * 1024 * 1024,
  },
  imageConstraints: {
    maxBytesPerImage: 8 * 1024 * 1024, // 8MB(インスタンス依存)
    maxImages: 4,
  },
  kinds: ['text', 'image', 'shortVideo', 'longVideo'],
};

export const MASTODON_SELECTORS = {
  /** 投稿ボタン(Mastodon Web UI の標準 class、locale 不問の data 属性が無いため) */
  postButton: 'button.button[type="submit"]',
  /** 投稿入力欄(fallback 用) */
  textarea: 'textarea.autosuggest-textarea__textarea',
  /** 画像添付用 file input(.compose-form 内の hidden input) */
  fileInput: '.compose-form input[type="file"], input[type="file"][multiple]',
} as const;
