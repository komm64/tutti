import type { PlatformId, PostResultMessage } from '../messages';

export interface CompressionState {
  progress: number;
  stage: 'load' | 'transcode';
}

interface PostingState {
  platforms: PlatformId[];
  pending: Set<PlatformId>;
  results: PostResultMessage[];
  startedAt: number;
  done: boolean;
  finishedAt?: number;
}

export interface PostingStateSnapshot {
  platforms: PlatformId[];
  pending: PlatformId[];
  results: PostResultMessage[];
  done: boolean;
  finishedAt?: number;
}

export interface BackgroundStateSnapshot {
  compression: CompressionState | null;
  posting: boolean;
  postingState: PostingStateSnapshot | null;
}

export interface PostingStateManagerOptions {
  onProgressUpdate?: (completed: number, total: number) => void;
  now?: () => number;
}

export function createPostingStateManager(options: PostingStateManagerOptions = {}) {
  const now = options.now ?? Date.now;
  let compression: CompressionState | null = null;
  let posting = false;
  let postingState: PostingState | null = null;

  function completedCount(): number {
    if (!postingState) return 0;
    return Math.min(postingState.platforms.length, postingState.platforms.length - postingState.pending.size);
  }

  return {
    setCompression(state: CompressionState | null): void {
      compression = state;
    },

    start(platforms: readonly PlatformId[]): void {
      posting = true;
      postingState = {
        platforms: [...platforms],
        pending: new Set(platforms),
        results: [],
        startedAt: now(),
        done: false,
      };
      options.onProgressUpdate?.(0, platforms.length);
    },

    recordResult(result: PostResultMessage): void {
      if (!postingState) return;

      postingState.pending.delete(result.platform);
      const existingIndex = postingState.results.findIndex((item) => item.platform === result.platform);
      if (existingIndex >= 0) {
        postingState.results[existingIndex] = result;
      } else {
        postingState.results.push(result);
      }
      options.onProgressUpdate?.(completedCount(), postingState.platforms.length);
    },

    markDone(): void {
      posting = false;
      compression = null;
      if (postingState) {
        postingState.done = true;
        postingState.finishedAt = now();
      }
    },

    clearPostingState(): void {
      postingState = null;
    },

    shouldClearBadgeOnRead(): boolean {
      return !posting && postingState?.done === true;
    },

    snapshot(): BackgroundStateSnapshot {
      return {
        compression,
        posting,
        postingState: postingState
          ? {
              platforms: [...postingState.platforms],
              pending: Array.from(postingState.pending),
              results: [...postingState.results],
              done: postingState.done,
              finishedAt: postingState.finishedAt,
            }
          : null,
      };
    },
  };
}
