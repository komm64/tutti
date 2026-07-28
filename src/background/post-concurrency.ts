import type { PlatformId } from '../types/platform';
import type { PostingAlgorithm } from '../types/posting';
import { getAdapter } from '../adapters/registry';

export const REAL_POST_CONCURRENCY = 1;
export const REAL_API_CONCURRENCY = 3;
export const REAL_BACKGROUND_CONCURRENCY = 3;
export const PREVIEW_BACKGROUND_CONCURRENCY = 3;
export const PREVIEW_VIDEO_BACKGROUND_CONCURRENCY = 1;
export const PREVIEW_FOREGROUND_CONCURRENCY = 1;

export type PostExecutionLaneId = 'serial' | 'api' | 'foreground' | 'background';
export type PostTransportPolicy = 'auto' | 'api-only' | 'dom-only';

export interface PostExecutionLane {
  id: PostExecutionLaneId;
  platforms: PlatformId[];
  concurrency: number;
  forceForeground: boolean;
  forceBackground?: boolean;
  transportPolicy?: PostTransportPolicy;
}

export interface PostExecutionPlan {
  lanes: PostExecutionLane[];
}

export interface PostExecutionPlanOptions {
  hasVideo?: boolean;
  postingAlgorithm?: PostingAlgorithm;
  apiPlatforms?: readonly PlatformId[];
}

export function buildPostExecutionPlan(
  platforms: readonly PlatformId[],
  autoPost: boolean,
  options: PostExecutionPlanOptions = {},
): PostExecutionPlan {
  if (autoPost) {
    if (options.postingAlgorithm === 'next') {
      return buildNextRealPostExecutionPlan(platforms, options);
    }
    return {
      lanes: [{
        id: 'serial',
        platforms: [...platforms],
        concurrency: REAL_POST_CONCURRENCY,
        forceForeground: false,
      }],
    };
  }

  if (options.hasVideo) {
    return {
      lanes: [{
        id: 'foreground',
        platforms: [...platforms],
        concurrency: PREVIEW_FOREGROUND_CONCURRENCY,
        forceForeground: true,
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

function buildNextRealPostExecutionPlan(
  platforms: readonly PlatformId[],
  options: PostExecutionPlanOptions,
): PostExecutionPlan {
  const apiSet = new Set(options.apiPlatforms ?? []);
  const api: PlatformId[] = [];
  const foreground: PlatformId[] = [];
  const background: PlatformId[] = [];

  for (const platform of platforms) {
    if (apiSet.has(platform)) {
      api.push(platform);
    } else if (needsForegroundRealPost(platform)) {
      foreground.push(platform);
    } else {
      background.push(platform);
    }
  }

  const lanes: PostExecutionLane[] = [];
  if (api.length > 0) {
    lanes.push({
      id: 'api',
      platforms: api,
      concurrency: REAL_API_CONCURRENCY,
      forceForeground: false,
      transportPolicy: 'api-only',
    });
  }
  if (foreground.length > 0) {
    lanes.push({
      id: 'foreground',
      platforms: foreground,
      concurrency: REAL_POST_CONCURRENCY,
      forceForeground: true,
    });
  }
  if (background.length > 0) {
    lanes.push({
      id: 'background',
      platforms: background,
      concurrency: options.hasVideo ? 1 : REAL_BACKGROUND_CONCURRENCY,
      forceForeground: false,
      forceBackground: true,
    });
  }
  return { lanes };
}

export function needsForegroundRealPost(platform: PlatformId): boolean {
  const adapter = getAdapter(platform);
  return adapter?.realPostLane !== 'background' ||
    adapter.requiresForegroundTab === true;
}

export function needsForegroundPreview(
  platform: PlatformId,
  options: PostExecutionPlanOptions = {},
): boolean {
  const adapter = getAdapter(platform);
  return (!options.hasVideo && adapter?.previewLane === 'foreground') ||
    adapter?.requiresForegroundTab === true;
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
