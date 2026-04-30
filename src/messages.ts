/**
 * popup ↔ background ↔ content script 間のメッセージ型定義。
 * すべてのメッセージはこの判別共用体のいずれかに該当する。
 */

export type PlatformId = 'x' | 'bluesky' | 'threads' | 'mastodon' | 'misskey' | 'tumblr';

/** 画像または動画の添付データ(ArrayBuffer は structured clone で通る) */
export interface ImageAttachment {
  name: string;
  type: string; // MIME type
  data: ArrayBuffer;
  /** 動画の場合の尺(秒)。background での制約チェックに使う */
  durationS?: number;
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
  /** dry-run: compose に流し込むが post button は押さない */
  dryRun?: boolean;
}

/** content script → background: 1 プラットフォームの投稿結果 */
export interface PostResultMessage {
  type: 'POST_RESULT';
  platform: PlatformId;
  success: boolean;
  error?: string;
}

/** background → popup: 1 プラットフォーム完了時の進捗通知(ストリーミング) */
export interface PlatformProgressMessage {
  type: 'PLATFORM_PROGRESS';
  result: PostResultMessage;
}

/** content script → background: 現在ログイン中のアカウント名 */
export interface CurrentUserMessage {
  type: 'CURRENT_USER';
  platform: PlatformId;
  username: string;
}

// ── offscreen document 用メッセージ (P7: 動画整形) ──────────────────────────

/** background → offscreen: 動画変換リクエスト */
export interface ConvertVideoMessage {
  type: 'CONVERT_VIDEO';
  videoData: ArrayBuffer;
  /** 対象アスペクト比 e.g. "16:9" */
  targetAspectRatio: string;
}

/** offscreen → background: 変換進捗 */
export interface ConversionProgressMessage {
  type: 'CONVERSION_PROGRESS';
  progress: number; // 0-1
}

/** offscreen → background: 変換完了 */
export interface ConversionCompleteMessage {
  type: 'CONVERSION_COMPLETE';
  videoData: ArrayBuffer;
}

/** offscreen → background: 変換エラー */
export interface ConversionErrorMessage {
  type: 'CONVERSION_ERROR';
  error: string;
}

export type Message =
  | PostRequestMessage
  | PostToPlatformMessage
  | PostResultMessage
  | PlatformProgressMessage
  | CurrentUserMessage
  | ConvertVideoMessage
  | ConversionProgressMessage
  | ConversionCompleteMessage
  | ConversionErrorMessage;
