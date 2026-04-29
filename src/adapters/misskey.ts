import type { PlatformAdapter } from './types';

/**
 * Misskey は Mastodon 同様 federated で、misskey.io が日本最大インスタンス。
 * /share?text= で post 入力欄が text 入りで開く Web Intent をサポート。
 * v1 はデフォルト misskey.io、ユーザー設定での切り替えは Mastodon と同じ
 * optional_host_permissions 経由で対応。
 */
export const MISSKEY_DEFAULT_INSTANCE = 'https://misskey.io';

export const misskeyAdapter: PlatformAdapter = {
  id: 'misskey',
  name: 'Misskey',
  charLimit: 3000, // misskey.io は 3000 文字、インスタンス依存
  matchUrl: (url) => url.startsWith(`${MISSKEY_DEFAULT_INSTANCE}/`),
  // Misskey の Web Intent: /share?text=...
  getComposeUrl: (text) =>
    `${MISSKEY_DEFAULT_INSTANCE}/share?text=${encodeURIComponent(text)}`,
  prefillsViaUrl: true,
  videoConstraints: {
    maxDurationS: 0, // インスタンス依存
    maxBytes: 100 * 1024 * 1024, // misskey.io は 100MB が目安
  },
  imageConstraints: {
    maxBytesPerImage: 100 * 1024 * 1024, // インスタンス依存だが大きめ
    maxImages: 16, // misskey は 16 枚まで
  },
  kinds: ['text', 'image', 'shortVideo', 'longVideo'],
};

export const MISSKEY_SELECTORS = {
  /** post button: data-cy か _buttonPrimary class */
  postButton: '[data-cy-post-form-submit], button._button._buttonPrimary[type="submit"]',
  /** textarea: data-cy で同定 */
  textarea: '[data-cy-post-form-text], textarea.text',
  /** file input */
  fileInput: '[data-cy-post-form-file] input[type="file"], input[type="file"][accept*="image"]',
} as const;
