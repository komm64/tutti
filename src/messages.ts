/**
 * popup ↔ background ↔ content script 間のメッセージ型定義。
 * すべてのメッセージはこの判別共用体のいずれかに該当する。
 */

export type PlatformId = 'x' | 'bluesky' | 'threads' | 'mastodon';

/** 画像添付データ(ArrayBuffer は structured clone で通る) */
export interface ImageAttachment {
  name: string;
  type: string; // MIME type
  data: ArrayBuffer;
}

/** popup → background: 全 SNS への投稿リクエスト */
export interface PostRequestMessage {
  type: 'POST_REQUEST';
  text: string;
  platforms: PlatformId[];
  images?: ImageAttachment[];
}

/** background → content script: 1 プラットフォームへの投稿指示 */
export interface PostToPlatformMessage {
  type: 'POST_TO_PLATFORM';
  platform: PlatformId;
  text: string;
  images?: ImageAttachment[];
}

/** content script → background: 1 プラットフォームの投稿結果 */
export interface PostResultMessage {
  type: 'POST_RESULT';
  platform: PlatformId;
  success: boolean;
  error?: string;
}

export type Message =
  | PostRequestMessage
  | PostToPlatformMessage
  | PostResultMessage;
