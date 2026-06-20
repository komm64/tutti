import type { PlatformId } from '../messages';
import { getAdapter } from '../adapters/registry';

export const REAL_POST_CONCURRENCY = 1;
export const PREVIEW_POST_CONCURRENCY = 3;

export function resolvePostConcurrency(platforms: readonly PlatformId[], autoPost: boolean): number {
  if (autoPost) return REAL_POST_CONCURRENCY;
  return platforms.some((platform) => getAdapter(platform)?.requiresForegroundTab)
    ? REAL_POST_CONCURRENCY
    : PREVIEW_POST_CONCURRENCY;
}
