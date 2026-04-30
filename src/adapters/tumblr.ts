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
  /** post button: aria-label / data-testid 系 */
  postButton: '[data-testid="postFormPostButton"], button[aria-label="Post"]',
  /** 本文の contenteditable(NPF editor の text block) */
  textarea: '[data-testid="text-block"] [contenteditable="true"], [contenteditable="true"][data-block-text-block], .post-form .editor [contenteditable="true"]',
  /** file input: compose 内の hidden input */
  fileInput: '[data-testid="postFormFile"] input[type="file"], input[type="file"][accept*="image"]',
} as const;
