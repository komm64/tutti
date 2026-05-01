import type { PlatformAdapter } from './types';

export const xAdapter: PlatformAdapter = {
  id: 'x',
  name: 'X',
  charLimit: 280,
  matchUrl: (url) => /^https:\/\/(x|twitter)\.com\//.test(url),
  /**
   * X はホーム画面の inline compose ("What's happening?") を使う。
   * /intent/post URL prefill は modal を開くが、その modal は home の inline
   * compose と draft state を共有するせいで「裏のホームにテキストが漏れる」
   * 現象が出る。inline compose に DOM 直接 inject すれば draft 共有問題は
   * 起きないし、modal/inline どちらの post button を踏むか問題も消える。
   */
  getComposeUrl: () => 'https://x.com/home',
  prefillsViaUrl: false,
  videoConstraints: {
    // X は無料層 2m20s だったが 2024 以降緩和、Premium で更に長い、と
    // 流動的なのでクライアント側で尺チェックしない。超過時は X 側で拒否される。
    maxDurationS: 0,
    maxBytes: 512 * 1024 * 1024,
  },
  imageConstraints: {
    maxBytesPerImage: 5 * 1024 * 1024, // 5MB
    maxImages: 4,
  },
  kinds: ['text', 'image', 'shortVideo', 'longVideo'],
};

export const X_SELECTORS = {
  /** ホーム画面の inline compose の textarea(本命) */
  textarea: '[data-testid="tweetTextarea_0"]',
  /** ホーム画面の inline compose の Post ボタン */
  postButtonInline: '[data-testid="tweetButtonInline"]',
  /** modal compose の Post ボタン(home に modal が出てしまった場合の fallback) */
  postButton: '[data-testid="tweetButton"]',
  /**
   * 画像添付用 hidden file input。inline compose を最優先、無ければグローバル fallback。
   * inject-helper.findEl は カンマ区切りを左から順に試す実装。
   */
  fileInput: 'main input[data-testid="fileInput"], input[data-testid="fileInput"]',
} as const;
