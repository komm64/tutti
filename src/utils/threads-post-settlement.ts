export interface ThreadsPostSettlementOptions {
  timeoutMs: number;
  isDraftOpen: () => boolean;
  findRejection: () => string | undefined;
  canRetry: () => boolean;
  retrySubmit: () => Promise<void>;
  retryAtMs?: readonly number[];
  pollMs?: number;
  onRetryError?: (error: unknown) => void;
}

export interface ThreadsPostSettlementResult {
  closed: boolean;
  retries: number;
  rejection?: string;
}

/**
 * Threads occasionally re-enables Post without dismissing the original draft.
 * Retry only while that same draft is visible and the button is enabled, and
 * keep all attempts inside one wall-clock budget so waits never add up into
 * several minutes.
 */
export async function settleThreadsPost(
  options: ThreadsPostSettlementOptions,
): Promise<ThreadsPostSettlementResult> {
  const startedAt = Date.now();
  const retryAtMs = options.retryAtMs ?? [8_000, 20_000];
  const pollMs = options.pollMs ?? 250;
  let retryIndex = 0;
  let retries = 0;
  let nextRetryAt = startedAt + (retryAtMs[0] ?? Number.POSITIVE_INFINITY);

  while (true) {
    const rejection = options.findRejection();
    if (rejection) return { closed: false, retries, rejection };
    if (!options.isDraftOpen()) return { closed: true, retries };

    const elapsedMs = Date.now() - startedAt;
    if (elapsedMs >= options.timeoutMs) {
      return { closed: !options.isDraftOpen(), retries };
    }

    if (
      retryIndex < retryAtMs.length &&
      Date.now() >= nextRetryAt &&
      options.canRetry()
    ) {
      const previousScheduleMs = retryAtMs[retryIndex]!;
      retryIndex += 1;
      const nextScheduleMs = retryAtMs[retryIndex];
      nextRetryAt = nextScheduleMs === undefined
        ? Number.POSITIVE_INFINITY
        : Date.now() + Math.max(0, nextScheduleMs - previousScheduleMs);
      try {
        await options.retrySubmit();
        retries += 1;
      } catch (error) {
        options.onRetryError?.(error);
      }
      continue;
    }

    await sleep(Math.min(pollMs, Math.max(1, options.timeoutMs - elapsedMs)));
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
