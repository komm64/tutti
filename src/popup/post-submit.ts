import type { PlatformId, PostResultMessage } from '../messages';
import type { ImagePreview, VideoPreview, Visibility } from './types';
import { buildPostRequest } from './post-media';

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
}

export interface PostSubmissionResponse {
  results?: PostResultMessage[];
  error?: string;
}

export type RuntimeSendMessage = (message: unknown) => Promise<unknown>;

export async function sendPostRequest(
  input: PostSubmissionInput,
  sendMessage: RuntimeSendMessage = (message) => browser.runtime.sendMessage(message),
): Promise<PostSubmissionResponse | undefined> {
  const message = await buildPostRequest(input);
  return await sendMessage(message) as PostSubmissionResponse | undefined;
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
  return autoPost && !!results?.length && results.every((result) => result.success && !result.preview);
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

export function buildRetryDedupSkippedResults(
  platforms: readonly PlatformId[],
  message: string,
): PostResultMessage[] {
  return platforms.map((platform) => ({
    type: 'POST_RESULT',
    platform,
    success: true,
    error: undefined,
    url: undefined,
    verify: {
      verified: true,
      issues: [{
        kind: 'retry-dedup-skipped',
        message,
        severity: 'warn',
      }],
    },
  }));
}
