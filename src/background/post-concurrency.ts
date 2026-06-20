import type { PlatformId } from '../messages';
import { getAdapter } from '../adapters/registry';

export const REAL_POST_CONCURRENCY = 1;
export const PREVIEW_BACKGROUND_CONCURRENCY = 3;
export const PREVIEW_VIDEO_BACKGROUND_CONCURRENCY = 1;
export const PREVIEW_FOREGROUND_CONCURRENCY = 1;

const INTERACTIVE_PREVIEW_PLATFORMS = new Set<PlatformId>(['x', 'tumblr']);

export type PostExecutionLaneId = 'serial' | 'foreground' | 'background';

export interface PostExecutionLane {
  id: PostExecutionLaneId;
  platforms: PlatformId[];
  concurrency: number;
  forceForeground: boolean;
}

export interface PostExecutionPlan {
  lanes: PostExecutionLane[];
}

export interface PostExecutionPlanOptions {
  hasVideo?: boolean;
}

export function buildPostExecutionPlan(
  platforms: readonly PlatformId[],
  autoPost: boolean,
  options: PostExecutionPlanOptions = {},
): PostExecutionPlan {
  if (autoPost) {
    return {
      lanes: [{
        id: 'serial',
        platforms: [...platforms],
        concurrency: REAL_POST_CONCURRENCY,
        forceForeground: false,
      }],
    };
  }

  const foreground: PlatformId[] = [];
  const background: PlatformId[] = [];
  for (const platform of platforms) {
    if (needsForegroundPreview(platform, options)) foreground.push(platform);
    else background.push(platform);
  }

  const lanes: PostExecutionLane[] = [];
  if (foreground.length > 0) {
    lanes.push({
      id: 'foreground',
      platforms: foreground,
      concurrency: PREVIEW_FOREGROUND_CONCURRENCY,
      forceForeground: true,
    });
  }
  if (background.length > 0) {
    lanes.push({
      id: 'background',
      platforms: background,
      concurrency: options.hasVideo ? PREVIEW_VIDEO_BACKGROUND_CONCURRENCY : PREVIEW_BACKGROUND_CONCURRENCY,
      forceForeground: false,
    });
  }

  return { lanes };
}

export function needsForegroundPreview(
  platform: PlatformId,
  options: PostExecutionPlanOptions = {},
): boolean {
  return (!options.hasVideo && INTERACTIVE_PREVIEW_PLATFORMS.has(platform)) ||
    getAdapter(platform)?.requiresForegroundTab === true;
}

export function resolvePostConcurrency(
  platforms: readonly PlatformId[],
  autoPost: boolean,
  options: PostExecutionPlanOptions = {},
): number {
  const plan = buildPostExecutionPlan(platforms, autoPost, options);
  return plan.lanes.reduce(
    (total, lane) => total + Math.min(lane.concurrency, lane.platforms.length),
    0,
  );
}
