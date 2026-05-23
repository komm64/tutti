import type { PlatformAdapter } from './types';

/**
 * Tumblr は単一の compose モーダルで text / image / video が混在可能。
 * /new/text で compose を開くが、URL pre-fill は信用できないので
 * prefillsViaUrl: false にして DOM injection で確実に入れる。
 */
export const tumblrAdapter: PlatformAdapter = {
  id: 'tumblr',
  name: 'Tumblr',
  charLimit: 4096,
  matchUrl: (url) => /^https:\/\/(www\.)?tumblr\.com\//.test(url),
  // /new/text で compose を開く。本文は DOM injection で入れる
  getComposeUrl: () => 'https://www.tumblr.com/new/text',
  getLoginUrl: () => 'https://www.tumblr.com/',
  prefillsViaUrl: false,
  videoConstraints: {
    maxDurationS: 0,
    maxBytes: 100 * 1024 * 1024,
  },
  imageConstraints: {
    maxBytesPerImage: 10 * 1024 * 1024,
    maxImages: 10,
  },
  kinds: ['text', 'image', 'shortVideo', 'longVideo'],
};

export const TUMBLR_SELECTORS = {
  /** post button: 現代 Tumblr は class="TRX6J VxmZd" の "Post now" だが、aria/testid 無い。
   *  text fallback (postButtonTexts) で拾う */
  postButton: '[data-testid="postFormPostButton"], button[aria-label="Post"], button[aria-label="Post now"]',
  /** 本文の contenteditable: Gutenberg-style block editor の p 要素(h1=title 除外) */
  textarea: '[data-testid="gutenberg-editor"] p[contenteditable="true"], .block-editor-rich-text__editable[role="document"]:not(h1)',
  /**
   * 画像添付の drop target。Tumblr の Gutenberg block editor 内に元から
   * 存在する `.components-drop-zone` に drop すると `/api/v2/media/image`
   * 経由でサーバアップロード+image block 挿入が走る。textarea(本文 p)に
   * drop するとブロックタイプ選択メニューが出てしまうので必ずこの dropzone
   * を狙うこと(2026-04-30 検証で 201 + ブロック生成を確認)。
   */
  dropTarget: '[role="dialog"] .components-drop-zone, .components-drop-zone',
  /**
   * Tags chip 入力 (v0.4.72〜): Tumblr の compose modal 下部にある "Tags editor"。
   * **textarea 要素** (input ではない、 probe 2026-05-22 で確定)。 aria-label
   * "Tags editor" が定番、 多段 fallback で input variant にも対応。
   * Tumblr は tags driven な culture で発見性に直結するため、 本文の `#word`
   * を抽出して chip として commit する。
   */
  tagInput:
    '[role="dialog"] textarea[aria-label="Tags editor"],' +
    '[role="dialog"] textarea[aria-label*="tag" i],' +
    '[role="dialog"] input[aria-label*="tag" i]:not([type="checkbox"]),' +
    '[role="dialog"] input[placeholder*="tag" i]:not([type="checkbox"]),' +
    'textarea[aria-label*="tag" i]',
} as const;
