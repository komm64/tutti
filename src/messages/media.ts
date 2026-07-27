/**
 * Media attachments, offscreen conversion, and chunked binary transfer.
 */

/**
 * Image or video data carried between extension contexts. Large binaries can
 * use `dataRef` instead of `data` to avoid runtime message size limits.
 */
export interface ImageAttachment {
  name: string;
  type: string;
  data?: string;
  dataRef?: string;
  bytes?: number;
  durationS?: number;
  videoCodec?: string;
  videoCodecParameters?: string;
  alt?: string;
}

export interface ConvertVideoMessage {
  type: 'CONVERT_VIDEO';
  inputRef: string;
  mimeType: string;
  durationS: number;
  targetBytes: number;
  aspectMode?: 'passthrough' | 'vertical9x16';
  trimToSeconds?: number;
}

export interface ConversionProgressMessage {
  type: 'CONVERSION_PROGRESS';
  progress: number;
  stage?: 'load' | 'transcode';
}

export interface ConversionCompleteMessage {
  type: 'CONVERSION_COMPLETE';
  outputRef: string;
  outputBytes: number;
}

export interface ConversionErrorMessage {
  type: 'CONVERSION_ERROR';
  error: string;
}

export interface GetBinaryChunkMessage {
  type: 'GET_BINARY_CHUNK';
  dataRef: string;
  offset: number;
  length: number;
}

export type MediaMessage =
  | ConvertVideoMessage
  | ConversionProgressMessage
  | ConversionCompleteMessage
  | ConversionErrorMessage
  | GetBinaryChunkMessage;
