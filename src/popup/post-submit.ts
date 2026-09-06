import type { PlatformId, PostRequestIntent, PostResultMessage } from '../messages';
import type { ImagePreview, VideoPreview, Visibility } from './types';
import { buildPostRequest } from './post-media';
import { createPostRequestId } from '../utils/post-request-id';

export interface PostSubmissionInput {
  text: string;
  platforms: PlatformId[];
  images: readonly ImagePreview[];
  video: VideoPreview | null;
  imageAlts: readonly string[];
  autoPost: boolean;
  cw: string;
  visibility: Visibility;
  trimToS: number | null;
  intent: Extract<PostRequestIntent, 'new' | 'retry'>;
}

export interface PostSubmissionResponse {
  results?: PostResultMessage[];
  error?: string;
}

export type RuntimeSendMessage = (message: unknown) => Promise<unknown>;

export interface PostRequestPollingOptions {
  intervalMs?: number;
  timeoutMs?: number;
  now?: () => number;
  sleep?: (delayMs: number) => Promise<void>;
}

const DEFAULT_POST_REQUEST_POLL_INTERVAL_MS = 500;
const DEFAULT_POST_REQUEST_POLL_TIMEOUT_MS = 60 * 60 * 1000;

/**
 * Real video posts use a dedicated foreground window because X suspends its
 * server-side video processing when that browser window loses OS focus.
 * Text/image posts keep the normal background path.
 */
export function needsVideoPostingConfirmation(
  input: Pick<PostSubmissionInput, 'autoPost' | 'video'>,
): boolean {
  return input.autoPost && input.video !== null;
}

export async function sendPostRequest(
  input: PostSubmissionInput,
  sendMessage: RuntimeSendMessage = (message) => browser.runtime.sendMessage(message),
  polling: PostRequestPollingOptions = {},
): Promise<PostSubmissionResponse | undefined> {
  const message = await buildPostRequest({
    ...input,
    requestId: createPostRequestId(),
  });
  const response = await sendMessage(message) as PostSubmissionResponse & {
    accepted?: boolean;
    requestId?: string;
  } | undefined;
  if (!response?.accepted) return response;
  if (response.requestId !== message.requestId) {
    throw new Error('POST_REQUEST acknowledgement did not match the submitted request');
  }
  return await pollPostRequestResult(message.requestId, sendMessage, polling);
}

export async function pollPostRequestResult(
  requestId: string,
  sendMessage: RuntimeSendMessage,
  options: PostRequestPollingOptions = {},
): Promise<PostSubmissionResponse> {
  const intervalMs = options.intervalMs ?? DEFAULT_POST_REQUEST_POLL_INTERVAL_MS;
  const timeoutMs = options.timeoutMs ?? DEFAULT_POST_REQUEST_POLL_TIMEOUT_MS;
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? ((delayMs: number) =>
    new Promise<void>((resolve) => setTimeout(resolve, delayMs)));
  const deadline = now() + timeoutMs;
  let lastError: unknown;

  while (now() <= deadline) {
    try {
      const state = await sendMessage({ type: 'GET_BG_STATE' }) as {
        postingState?: {
          requestId?: string;
          results?: PostResultMessage[];
          done?: boolean;
        } | null;
      } | undefined;
      if (state?.postingState?.requestId === requestId && state.postingState.done) {
        return { results: state.postingState.results ?? [] };
      }
      lastError = undefined;
    } catch (error) {
      // A worker restart or popup lifecycle race can make one poll fail. Retry
      // while the request's overall timeout budget remains available.
      lastError = error;
    }
    await sleep(intervalMs);
  }

  const suffix = lastError
    ? ` Last state read failed: ${lastError instanceof Error ? lastError.message : String(lastError)}`
    : '';
  throw new Error(`POST_REQUEST state timed out after ${timeoutMs}ms.${suffix}`);
}

export function mergePostResults(
  current: readonly PostResultMessage[] | null,
  incoming: readonly PostResultMessage[],
  isRetry: boolean,
): PostResultMessage[] {
  if (!isRetry) return [...incoming];
  const incomingIds = new Set(incoming.map((result) => result.platform));
  return [
    ...(current ?? []).filter((result) => !incomingIds.has(result.platform)),
    ...incoming,
  ];
}

export function shouldClearDraftAfterSubmit(
  autoPost: boolean,
  results: readonly PostResultMessage[] | null,
): boolean {
  return autoPost && !!results?.length && results.every(isDurablePostedResult);
}

export function isDurablePostedResult(result: PostResultMessage): boolean {
  return result.success === true && result.preview !== true && !!result.url;
}

export function failedRetryPlatforms(results: readonly PostResultMessage[] | null): PlatformId[] {
  return (results ?? [])
    .filter((result) => !result.success && !result.uncertain)
    .map((result) => result.platform);
}

export function uncertainPlatforms(results: readonly PostResultMessage[] | null): PlatformId[] {
  return (results ?? [])
    .filter((result) => result.uncertain)
    .map((result) => result.platform);
}

export function normalizeRetryGuardResults(
  results: readonly PostResultMessage[],
): PostResultMessage[] {
  return results.map((result) => {
    if (result.submissionGuard?.reason !== 'recent-success') return result;
    return {
      ...result,
      success: true,
      uncertain: undefined,
      userAction: undefined,
      error: undefined,
      verify: {
        verified: true,
        issues: [{
          kind: 'retry-dedup-skipped',
          message: result.error ?? '',
          severity: 'warn',
        }],
      },
    };
  });
}
