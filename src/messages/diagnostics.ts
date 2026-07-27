/**
 * Diagnostics, logging, and background-state query contracts.
 */

import type { PlatformId } from '../types/platform';

export interface DiagnoseRequestMessage {
  type: 'DIAGNOSE_REQUEST';
  platforms?: PlatformId[];
}

export interface DiagnosePlatformMessage {
  type: 'DIAGNOSE_PLATFORM';
  platform: PlatformId;
}

export interface DiagnosePlatformResult {
  type: 'DIAGNOSE_PLATFORM_RESULT';
  platform: PlatformId;
  url: string;
  selectors: SelectorAudit[];
  detectedUser: string | null;
  domSnapshot: string | null;
}

export interface SelectorAudit {
  name: string;
  selector: string;
  matchCount: number;
  firstMatchPreview: string | null;
}

export type LogLevel = 'OFF' | 'ERROR' | 'WARN' | 'INFO' | 'DEBUG';

export interface LogEntry {
  ts: number;
  level: LogLevel;
  context: string;
  message: string;
}

export interface LogAppendMessage {
  type: 'LOG_APPEND';
  entry: LogEntry;
}

export interface LogExportRequestMessage {
  type: 'LOG_EXPORT_REQUEST';
}

export interface LogClearMessage {
  type: 'LOG_CLEAR';
}

export interface GetBgStateMessage {
  type: 'GET_BG_STATE';
}

export type DiagnosticsMessage =
  | DiagnoseRequestMessage
  | DiagnosePlatformMessage
  | DiagnosePlatformResult
  | LogAppendMessage
  | LogExportRequestMessage
  | LogClearMessage
  | GetBgStateMessage;
