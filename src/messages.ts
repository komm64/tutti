/**
 * popup ↔ background ↔ content script 間のメッセージ型定義。
 * すべてのメッセージはこの判別共用体のいずれかに該当する。
 */

export type PlatformId = 'x' | 'bluesky' | 'threads' | 'mastodon' | 'misskey' | 'tumblr' | 'pixiv' | 'deviantart' | 'instagram' | 'tiktok' | 'youtube';

/**
 * 画像または動画の添付データ。
 * 拡張内 message では base64 文字列で運ぶ(ArrayBuffer は MV3 で潰れる)。
 * デコードは送信先側で行う(`src/utils/base64.ts` の `base64ToUint8Array`)。
 */
export interface ImageAttachment {
  name: string;
  type: string; // MIME type
  /**
   * base64-encoded binary content。**dataRef がある場合は省略可** (sendMessage の
   * 64MB 上限を超える binary は IndexedDB binary-transfer 経由で運ぶため)。
   * popup の在庫状態 / 履歴では常に存在、message の wire format では dataRef
   * 経由になり得る。
   */
  data?: string;
  /**
   * IndexedDB binary-transfer id。data 代わりに使う。
   * `src/utils/binary-transfer.ts` の putBinary が返す id。受信側は
   * `resolveAttachmentToBytes/Base64` で resolve してから使う。
   */
  dataRef?: string;
  /** binary size (バイト)。base64 デコードしなくてもサイズが分かる */
  bytes?: number;
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
  /**
   * thread mode: 文字数オーバーで分割されたチャンクを 1 つの compose 内に
   * 連投スレッドとして並べる場合 (X のみ対応 v0.4.56〜)。指定時は text フィールド
   * は無視され、textChunks の各要素が 1 ポストになる。images は最初のチャンクにだけ付く。
   */
  textChunks?: string[];
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
  /**
   * 入力動画の IndexedDB binary-transfer id (`src/utils/binary-transfer.ts`)。
   * sendMessage の 64MB cap を回避するため拡張内 IndexedDB 経由で運ぶ。
   * offscreen は getBinary(inputRef) で bytes を取得する。
   */
  inputRef: string;
  /** mime type (e.g. "video/mp4")。出力は常に mp4/h.264/aac */
  mimeType: string;
  /** 動画長 (秒)。bitrate 計算に使う */
  durationS: number;
  /** 目標 byte 数。video bitrate = (targetBytes * 8 / duration) - audioKbps を解いて算出 */
  targetBytes: number;
}

/** offscreen → background: 変換進捗 */
export interface ConversionProgressMessage {
  type: 'CONVERSION_PROGRESS';
  progress: number; // 0-1
  /** 進捗段階 (load / transcode) */
  stage?: 'load' | 'transcode';
}

/** offscreen → background: 変換完了 (IndexedDB ref で返す) */
export interface ConversionCompleteMessage {
  type: 'CONVERSION_COMPLETE';
  /** 出力動画の IndexedDB binary-transfer id。background が getBinary で取得 */
  outputRef: string;
  /** 出力後の byte 数 (popup 表示用) */
  outputBytes: number;
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
  /**
   * 障害時の DOM 構造 snapshot (redacted)。selector miss が 1 件以上ある時のみ
   * 含める。AI に「壊れたページの DOM はこれ、新 selector を提案して」と
   * 渡す入力。本文 text / image src / value 属性は strip 済み。
   */
  domSnapshot: string | null;
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

/**
 * popup → background: 圧縮 / 投稿の進行状態を問い合わせ。popup を閉じて
 * 再 open した時に、進行中の作業の UI を復活させるために使う。
 */
export interface GetBgStateMessage {
  type: 'GET_BG_STATE';
}

/**
 * content script → background: 大きな binary を chunked で取得する。
 * tabs.sendMessage の 64MB cap を回避するため、media を base64 で全送りせず
 * dataRef を渡しておいて content script 側でこの message を loop 呼び出し。
 */
export interface GetBinaryChunkMessage {
  type: 'GET_BINARY_CHUNK';
  dataRef: string;
  offset: number;
  length: number;
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
  | GetBgStateMessage
  | GetBinaryChunkMessage
  | LogClearMessage;
