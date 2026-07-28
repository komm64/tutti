/**
 * Posting requests, per-platform dispatch/results, and posting verification.
 */

import type { PlatformId } from '../types/platform';
import type { PostingAlgorithm } from '../types/posting';
import type { ImageAttachment } from './media';

export type UserActionCategory =
  | 'sign-in'
  | 'check-account'
  | 'complete-captcha'
  | 'complete-confirmation'
  | 'activate-tab'
  | 'check-post-before-retry'
  | 'fix-media'
  | 'wait'
  | 'report-ui-change';

export type PostFlowStep = string;

export interface PostFlowTrace {
  mode?: 'preview' | 'post';
  attempt?: string;
  lastCompletedStep?: PostFlowStep;
  failedStep?: PostFlowStep;
  submitReached: boolean;
  submissionStartedAt?: number;
  tabUrlBefore?: string;
  tabUrlAfter?: string;
  urlCaptureTrace?: string[];
}

export type PostRequestIntent = 'new' | 'retry' | 'history-repost';
export type SubmissionGuardDecision = 'allow' | 'blocked' | 'indeterminate';
export type SubmissionGuardReason =
  | 'in-flight'
  | 'recent-success'
  | 'recent-uncertain'
  | 'fingerprint-unavailable'
  | 'history-unavailable';

export interface SubmissionGuardTrace {
  decision: SubmissionGuardDecision;
  reason?: SubmissionGuardReason;
  requestId: string;
}

export type PostImplementationPath = PostingAlgorithm;

export interface PostImplementationDiagnostics {
  revision: number;
  path: PostImplementationPath;
}

export interface PostRequestMessage {
  type: 'POST_REQUEST';
  requestId: string;
  intent: PostRequestIntent;
  sourceHistoryEntryId?: string;
  text: string;
  platforms: PlatformId[];
  images?: ImageAttachment[];
  autoPost?: boolean;
  cw?: string;
  visibility?: 'public' | 'unlisted' | 'private' | 'direct';
  trimVideoToSeconds?: number;
}

export interface PostToPlatformMessage {
  type: 'POST_TO_PLATFORM';
  platform: PlatformId;
  text: string;
  textChunks?: string[];
  images?: ImageAttachment[];
  dryRun?: boolean;
  expectedUser?: string;
  cw?: string;
  visibility?: 'public' | 'unlisted' | 'private' | 'direct';
}

export interface PostResultMessage {
  type: 'POST_RESULT';
  platform: PlatformId;
  success: boolean;
  preview?: boolean;
  confirmed?: boolean;
  uncertain?: boolean;
  implementation?: PostImplementationDiagnostics;
  submissionGuard?: SubmissionGuardTrace;
  userAction?: UserActionCategory;
  flow?: PostFlowTrace;
  error?: string;
  url?: string;
  verify?: {
    verified: boolean;
    issues: { kind: string; message: string; severity: 'warn' | 'error' }[];
  };
}

export interface PlatformProgressMessage {
  type: 'PLATFORM_PROGRESS';
  result: PostResultMessage;
}

export interface ClearPostingStateMessage {
  type: 'CLEAR_POSTING_STATE';
}

export interface VerifyPostDomMessage {
  type: 'VERIFY_POST_DOM';
}

export interface VerifyPostDomResult {
  type: 'VERIFY_POST_DOM_RESULT';
  ogDescription: string;
  ogImage: string;
  hasImage?: boolean;
  hasVideo?: boolean;
  bodyExcerpt: string;
}

export type PostingMessage =
  | PostRequestMessage
  | PostToPlatformMessage
  | PostResultMessage
  | PlatformProgressMessage
  | ClearPostingStateMessage
  | VerifyPostDomMessage
  | VerifyPostDomResult;
