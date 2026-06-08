import type { PlatformId, PostResultMessage } from '../messages';

export interface PostWorkerPoolOptions {
  platforms: readonly PlatformId[];
  concurrency: number;
  post: (platform: PlatformId) => Promise<PostResultMessage>;
  onResult?: (result: PostResultMessage) => void;
}

export async function runPostWorkerPool(options: PostWorkerPoolOptions): Promise<PostResultMessage[]> {
  const queue: PlatformId[] = [...options.platforms];
  const results: PostResultMessage[] = [];
  const workerCount = Math.min(Math.max(0, options.concurrency), queue.length);
  const workers = Array.from({ length: workerCount }, async () => {
    while (queue.length > 0) {
      const platform = queue.shift();
      if (!platform) break;
      const result = await options.post(platform);
      results.push(result);
      options.onResult?.(result);
    }
  });
  await Promise.all(workers);
  return results;
}
