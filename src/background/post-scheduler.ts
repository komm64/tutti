import type { PlatformId, PostResultMessage } from '../messages';
import {
  buildPostExecutionPlan,
  type PostExecutionLane,
  type PostExecutionPlanOptions,
} from './post-concurrency';
import { runPostWorkerPool } from './post-worker-pool';

export interface PostExecutionOptions {
  forceForeground: boolean;
  lane: PostExecutionLane['id'];
}

export interface PostSchedulerOptions {
  platforms: readonly PlatformId[];
  autoPost: boolean;
  planOptions?: PostExecutionPlanOptions;
  post: (platform: PlatformId, options: PostExecutionOptions) => Promise<PostResultMessage>;
  onResult?: (result: PostResultMessage) => void;
}

export async function runPostScheduler(options: PostSchedulerOptions): Promise<PostResultMessage[]> {
  const plan = buildPostExecutionPlan(options.platforms, options.autoPost, options.planOptions);
  const results: PostResultMessage[] = [];

  await Promise.all(plan.lanes.map(async (lane) => {
    await runLane(lane, options, (result) => {
      results.push(result);
      options.onResult?.(result);
    });
  }));

  return results;
}

async function runLane(
  lane: PostExecutionLane,
  options: PostSchedulerOptions,
  onResult: (result: PostResultMessage) => void,
): Promise<void> {
  await runPostWorkerPool({
    platforms: lane.platforms,
    concurrency: lane.concurrency,
    post: (platform) => options.post(platform, {
      forceForeground: lane.forceForeground,
      lane: lane.id,
    }),
    onResult,
  });
}
