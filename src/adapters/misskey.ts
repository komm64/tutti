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
  getLoginUrl: () => MISSKEY_DEFAULT_INSTANCE,
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
  /**
   * 画像添付の drop target。Misskey は file input が DOM に存在せず、
   * 添付ボタンから直接 OS picker が開く。textarea に drop を dispatch すると
   * Vue が反応してアップロード開始する(2026-04-30 検証、Misskey 自身も
   * 内部で `browser-image-resizer` を呼んで画像処理することを log で確認)。
   */
  dropTarget: '[data-cy-post-form-text], textarea.text, ._gaps_._w_700',
} as const;
