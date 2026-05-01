/**
 * popup ↔ background ↔ content script 間のメッセージ型定義。
 * すべてのメッセージはこの判別共用体のいずれかに該当する。
 */

export type PlatformId = 'x' | 'bluesky' | 'threads' | 'mastodon' | 'misskey' | 'tumblr' | 'pixiv';

/**
 * 画像または動画の添付データ。
 * 拡張内 message では base64 文字列で運ぶ(ArrayBuffer は MV3 で潰れる)。
 * デコードは送信先側で行う(`src/utils/base64.ts` の `base64ToUint8Array`)。
 */
export interface ImageAttachment {
  name: string;
  type: string; // MIME type
  /** base64-encoded binary content */
  data: string;
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

// ── 診断 (Diagnostics) ───────────────────────────────────────────────────────

/** popup → background: 全 SNS の現在状態を吸い上げてレポート化する */
export interface DiagnoseRequestMessage {
  type: 'DIAGNOSE_REQUEST';
}

/** background → content script: selector audit を要求 */
export interface DiagnosePlatformMessage {
  type: 'DIAGNOSE_PLATFORM';
  platform: PlatformId;
}

/** content script → background: selector audit 結果 */
export interface DiagnosePlatformResult {
  type: 'DIAGNOSE_PLATFORM_RESULT';
  platform: PlatformId;
  url: string;
  selectors: SelectorAudit[];
  /** ログイン中ユーザー検出が成功したか(同じロジックで再実行) */
  detectedUser: string | null;
}

export interface SelectorAudit {
  /** 役割名(例: "fileInput", "textarea", "postButton") */
  name: string;
  selector: string;
  matchCount: number;
  /** 最初のマッチの outerHTML 先頭(短く) */
  firstMatchPreview: string | null;
}

// ── Logger (各 context → background のログ集約) ───────────────────────────

export type LogLevel = 'OFF' | 'ERROR' | 'WARN' | 'INFO' | 'DEBUG';

export interface LogEntry {
  /** 発行時刻 (ms epoch) */
  ts: number;
  level: LogLevel;
  /** popup / background / SNS host 等の発行 context */
  context: string;
  message: string;
}

/** 任意 context → background: ログ 1 件追加 */
export interface LogAppendMessage {
  type: 'LOG_APPEND';
  entry: LogEntry;
}

/** popup → background: バッファのスナップショット要求 */
export interface LogExportRequestMessage {
  type: 'LOG_EXPORT_REQUEST';
}

/** popup → background: バッファをクリア */
export interface LogClearMessage {
  type: 'LOG_CLEAR';
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
  | ConversionErrorMessage
  | DiagnoseRequestMessage
  | DiagnosePlatformMessage
  | DiagnosePlatformResult
  | LogAppendMessage
  | LogExportRequestMessage
  | LogClearMessage;
