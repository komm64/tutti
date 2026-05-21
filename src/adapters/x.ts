import type { PlatformAdapter } from './types';

export const xAdapter: PlatformAdapter = {
  id: 'x',
  name: 'X',
  charLimit: 280,
  matchUrl: (url) => /^https:\/\/(x|twitter)\.com\//.test(url),
  /**
   * X はホーム画面の inline compose ("What's happening?") を使う。
   * 旧: thread mode (chunks>1) は `/compose/post` modal を介して 1 compose に
   *     複数 textbox を連結する実装だったが、 X UI 変更で Add post button が
   *     navigation 引き起こすようになり完全失敗 (v0.4.65 user 報告)。
   * v0.4.66〜: thread chaining は捨てて、 chunks > 1 は generic chunks loop で
   *     各 chunk を別 tweet として post (background.ts 側で処理)。 ここは
   *     単 chunk 用の inline compose URL に戻る。
   * /intent/post URL prefill は home の draft state と共有して漏れる現象が
   * 出るので使わない (prefillsViaUrl=false で DOM inject)。
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
  /** ホーム画面の inline compose の textarea */
  textarea: '[data-testid="tweetTextarea_0"][role="textbox"]',
  /** ホーム画面の inline compose の Post ボタン */
  postButtonInline: '[data-testid="tweetButtonInline"]',
  /** modal compose の Post ボタン (fallback) */
  postButton: '[data-testid="tweetButton"]',
  /** 画像添付の hidden file input */
  fileInput: 'main input[data-testid="fileInput"], input[data-testid="fileInput"]',
} as const;
