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
  popupOrder: 5,
  defaultSelected: true,
  realPostLane: 'background',
  preSubmitLoad: {
    retryCount: 1,
    urlReady: 'same-origin-path',
  },
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
  /**
   * 投稿ボタン。旧 UI は `.button`、compose redesign (mastodon.social) は
   * `form[role=dialog]` 内の submit。redesign の CSS module 接頭辞は
   * `_compose_redesign__` → `_feat_compose__` (2026-10-30) と変わるので
   * 接頭辞に依存しない。locale 不問の data 属性は無い
   */
  postButton:
    'button.button[type="submit"], form[role="dialog"][class*="__root"] button[type="submit"]',
  /** 投稿入力欄 (旧 UI / redesign 両対応) */
  textarea:
    'textarea.autosuggest-textarea__textarea, form[role="dialog"][class*="__root"] textarea[class*="__textarea"]',
  /** 画像添付用 file input (旧 UI は .compose-form、redesign は form footer) */
  fileInput:
    '.compose-form input[type="file"], form[role="dialog"][class*="__root"] input[type="file"], input[type="file"][multiple]',
} as const;
