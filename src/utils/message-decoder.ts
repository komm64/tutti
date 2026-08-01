import type {
  ImageAttachment,
  Message,
  PostRequestIntent,
  PostResultMessage,
} from '../messages';
import { PLATFORM_IDS, type PlatformId } from '../types/platform';
import { createPostRequestId } from './post-request-id';

type UnknownRecord = Record<string, unknown>;
type Validator = (value: UnknownRecord) => boolean;

const PLATFORM_ID_SET = new Set<string>(PLATFORM_IDS);

const VISIBILITIES = new Set(['public', 'unlisted', 'private', 'direct']);
const USER_ACTIONS = new Set([
  'sign-in',
  'check-account',
  'complete-captcha',
  'complete-confirmation',
  'activate-tab',
  'check-post-before-retry',
  'fix-media',
  'wait',
  'report-ui-change',
]);
const LOG_LEVELS = new Set(['OFF', 'ERROR', 'WARN', 'INFO', 'DEBUG']);
const POST_REQUEST_INTENTS = new Set<PostRequestIntent>(['new', 'retry', 'history-repost']);
const SUBMISSION_GUARD_DECISIONS = new Set(['allow', 'blocked', 'indeterminate']);
const SUBMISSION_GUARD_REASONS = new Set([
  'in-flight',
  'recent-success',
  'recent-uncertain',
  'fingerprint-unavailable',
  'history-unavailable',
]);

const MESSAGE_VALIDATORS = {
  POST_REQUEST: (value) =>
    isString(value.text) &&
    isPlatformArray(value.platforms) &&
    optional(value, 'images', isAttachmentArray) &&
    optional(value, 'autoPost', isBoolean) &&
    optional(value, 'cw', isString) &&
    optional(value, 'visibility', (item) => isString(item) && VISIBILITIES.has(item)) &&
    optional(value, 'trimVideoToSeconds', isFiniteNumber) &&
    optional(value, 'sourceHistoryEntryId', isString),
  POST_TO_PLATFORM: (value) =>
    isPlatformId(value.platform) &&
    isString(value.text) &&
    optional(
      value,
      'implementationPath',
      (item) => item === 'legacy' || item === 'next',
    ) &&
    optional(value, 'textChunks', isStringArray) &&
    optional(value, 'images', isAttachmentArray) &&
    optional(value, 'dryRun', isBoolean) &&
    optional(value, 'expectedUser', isString) &&
    optional(value, 'cw', isString) &&
    optional(value, 'visibility', (item) => isString(item) && VISIBILITIES.has(item)),
  POST_RESULT: isPostResult,
  PLATFORM_PROGRESS: (value) => isPostResult(value.result),
  GET_EXTENSION_UPDATE_STATE: () => true,
  APPLY_EXTENSION_UPDATE: () => true,
  EXTENSION_UPDATE_AVAILABLE: (value) => isExtensionUpdateState(value.state),
  CURRENT_USER: (value) =>
    isPlatformId(value.platform) &&
    (isString(value.username) || value.username === null),
  CONVERT_VIDEO: (value) =>
    isString(value.inputRef) &&
    isString(value.mimeType) &&
    isFiniteNumber(value.durationS) &&
    isFiniteNumber(value.targetBytes) &&
    optional(value, 'aspectMode', (item) => item === 'passthrough' || item === 'vertical9x16') &&
    optional(value, 'trimToSeconds', isFiniteNumber),
  CONVERSION_PROGRESS: (value) =>
    isFiniteNumber(value.progress) &&
    optional(value, 'stage', (item) => item === 'load' || item === 'transcode'),
  CONVERSION_COMPLETE: (value) =>
    isString(value.outputRef) &&
    isFiniteNumber(value.outputBytes),
  CONVERSION_ERROR: (value) => isString(value.error),
  DIAGNOSE_REQUEST: (value) => optional(value, 'platforms', isPlatformArray),
  DIAGNOSE_PLATFORM: (value) => isPlatformId(value.platform),
  DIAGNOSE_PLATFORM_RESULT: (value) =>
    isPlatformId(value.platform) &&
    isString(value.url) &&
    Array.isArray(value.selectors) &&
    value.selectors.every(isSelectorAudit) &&
    (isString(value.detectedUser) || value.detectedUser === null) &&
    (isString(value.domSnapshot) || value.domSnapshot === null),
  LOG_APPEND: (value) => isLogEntry(value.entry),
  LOG_EXPORT_REQUEST: () => true,
  GET_BG_STATE: () => true,
  CLEAR_POSTING_STATE: () => true,
  POSTING_MEDIA_FOCUS: (value) =>
    value.phase === 'acquire' || value.phase === 'release',
  GET_BINARY_CHUNK: (value) =>
    isString(value.dataRef) &&
    isFiniteNumber(value.offset) &&
    isFiniteNumber(value.length),
  GET_BLUESKY_SESSION: () => true,
  BLUESKY_SESSION_RESULT: (value) =>
    isString(value.accessJwt) &&
    isString(value.did) &&
    isString(value.handle) &&
    optional(value, 'pdsHost', isString),
  VERIFY_POST_DOM: () => true,
  VERIFY_POST_DOM_RESULT: (value) =>
    isString(value.ogDescription) &&
    isString(value.ogImage) &&
    isString(value.bodyExcerpt) &&
    optional(value, 'hasImage', isBoolean) &&
    optional(value, 'hasVideo', isBoolean),
  REFRESH_USER: () => true,
  BROADCAST_REFRESH_USERS: () => true,
  USER_ACTION_REQUIRED: (value) =>
    isPlatformId(value.platform) &&
    (value.reason === 'captcha' || value.reason === 'confirmation'),
  LOG_CLEAR: () => true,
} satisfies Record<Message['type'], Validator>;

/**
 * Decode an extension runtime message without imposing an exact-object wire
 * contract. Known required fields are checked, while additive unknown fields
 * remain on the original object for forward compatibility.
 */
export function decodeMessage(value: unknown): Message | undefined {
  return decodeMessageWithDiagnostics(value)?.message;
}

export interface MessageDecodeDiagnostics {
  requestIdDefaulted?: true;
  intentDefaulted?: true;
  receivedIntent?: string;
}

export interface DecodedMessage {
  message: Message;
  diagnostics: MessageDecodeDiagnostics;
}

export function decodeMessageWithDiagnostics(value: unknown): DecodedMessage | undefined {
  if (!isRecord(value) || !isString(value.type)) return undefined;
  const validator = MESSAGE_VALIDATORS[value.type as Message['type']];
  if (!validator || !validator(value)) return undefined;
  if (value.type !== 'POST_REQUEST') {
    return { message: value as unknown as Message, diagnostics: {} };
  }

  const diagnostics: MessageDecodeDiagnostics = {};
  const requestId = isString(value.requestId) && value.requestId.trim()
    ? value.requestId
    : createPostRequestId();
  if (requestId !== value.requestId) diagnostics.requestIdDefaulted = true;

  const intent = isPostRequestIntent(value.intent)
    ? value.intent
    : value.autoPost === false ? 'new' : 'retry';
  if (intent !== value.intent) {
    diagnostics.intentDefaulted = true;
    if (isString(value.intent)) diagnostics.receivedIntent = value.intent;
  }

  const message = requestId === value.requestId && intent === value.intent
    ? value
    : { ...value, requestId, intent };
  return { message: message as unknown as Message, diagnostics };
}

function isPostResult(value: unknown): value is PostResultMessage {
  if (!isRecord(value) || value.type !== 'POST_RESULT') return false;
  return isPlatformId(value.platform) &&
    isBoolean(value.success) &&
    optional(value, 'preview', isBoolean) &&
    optional(value, 'confirmed', isBoolean) &&
    optional(value, 'uncertain', isBoolean) &&
    optional(value, 'submissionGuard', isSubmissionGuardTrace) &&
    optional(value, 'userAction', (item) => isString(item) && USER_ACTIONS.has(item)) &&
    optional(value, 'flow', isPostFlowTrace) &&
    optional(value, 'error', isString) &&
    optional(value, 'url', isString) &&
    optional(value, 'verify', isPostVerifyResult);
}

function isPostFlowTrace(value: unknown): boolean {
  if (!isRecord(value) || !isBoolean(value.submitReached)) return false;
  return optional(value, 'mode', (item) => item === 'preview' || item === 'post') &&
    optional(value, 'attempt', isString) &&
    optional(value, 'lastCompletedStep', isString) &&
    optional(value, 'failedStep', isString) &&
    optional(value, 'submissionStartedAt', isFiniteNumber) &&
    optional(value, 'tabUrlBefore', isString) &&
    optional(value, 'tabUrlAfter', isString) &&
    optional(value, 'urlCaptureTrace', isStringArray) &&
    optional(value, 'totalDurationMs', isFiniteNumber) &&
    optional(value, 'stageTimings', (item) => (
      Array.isArray(item) && item.every(isPostStageTiming)
    ));
}

function isPostStageTiming(value: unknown): boolean {
  return isRecord(value) &&
    isString(value.step) &&
    isFiniteNumber(value.durationMs) &&
    optional(
      value,
      'outcome',
      (item) => item === 'completed' || item === 'failed',
    );
}

function isSubmissionGuardTrace(value: unknown): boolean {
  if (!isRecord(value) ||
      !isString(value.decision) ||
      !SUBMISSION_GUARD_DECISIONS.has(value.decision) ||
      !isString(value.requestId)) {
    return false;
  }
  return optional(
    value,
    'reason',
    (item) => isString(item) && SUBMISSION_GUARD_REASONS.has(item),
  );
}

function isPostVerifyResult(value: unknown): boolean {
  if (!isRecord(value) || !isBoolean(value.verified) || !Array.isArray(value.issues)) return false;
  return value.issues.every((issue) =>
    isRecord(issue) &&
    isString(issue.kind) &&
    isString(issue.message) &&
    (issue.severity === 'warn' || issue.severity === 'error'),
  );
}

function isExtensionUpdateState(value: unknown): boolean {
  if (!isRecord(value) || !isBoolean(value.available)) return false;
  return optional(value, 'version', isString) &&
    optional(value, 'applying', isBoolean);
}

function isSelectorAudit(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return isString(value.name) &&
    isString(value.selector) &&
    isFiniteNumber(value.matchCount) &&
    (isString(value.firstMatchPreview) || value.firstMatchPreview === null);
}

function isLogEntry(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return isFiniteNumber(value.ts) &&
    isString(value.level) &&
    LOG_LEVELS.has(value.level) &&
    isString(value.context) &&
    isString(value.message);
}

function isAttachmentArray(value: unknown): value is ImageAttachment[] {
  return Array.isArray(value) && value.every(isAttachment);
}

function isAttachment(value: unknown): value is ImageAttachment {
  if (!isRecord(value) || !isString(value.name) || !isString(value.type)) return false;
  return optional(value, 'data', isString) &&
    optional(value, 'dataRef', isString) &&
    optional(value, 'bytes', isFiniteNumber) &&
    optional(value, 'durationS', isFiniteNumber) &&
    optional(value, 'videoCodec', isString) &&
    optional(value, 'videoCodecParameters', isString) &&
    optional(value, 'alt', isString);
}

function isPlatformArray(value: unknown): value is PlatformId[] {
  return Array.isArray(value) && value.every(isPlatformId);
}

function isPostRequestIntent(value: unknown): value is PostRequestIntent {
  return isString(value) && POST_REQUEST_INTENTS.has(value as PostRequestIntent);
}

function isPlatformId(value: unknown): value is PlatformId {
  return isString(value) && PLATFORM_ID_SET.has(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isString);
}

function optional(
  value: UnknownRecord,
  key: string,
  predicate: (item: unknown) => boolean,
): boolean {
  return value[key] === undefined || predicate(value[key]);
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}
