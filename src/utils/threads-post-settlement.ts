export interface ThreadsPostSettlementOptions {
  timeoutMs: number;
  isDraftOpen: () => boolean;
  /** Return the post URL when the initial submit produced durable evidence. */
  findPostEvidence: () => string | undefined;
  findRejection: () => string | undefined;
  pollMs?: number;
}

export interface ThreadsPostSettlementResult {
  outcome: 'confirmed' | 'closed' | 'rejected' | 'uncertain';
  url?: string;
  rejection?: string;
}

/**
 * Observe the result of one irreversible Threads submit. Threads can leave the
 * submitted composer mounted and re-enable its Post button, so composer state
 * must never trigger another click: without durable post evidence a retry can
 * duplicate a post that already succeeded.
 */
export async function settleThreadsPost(
  options: ThreadsPostSettlementOptions,
): Promise<ThreadsPostSettlementResult> {
  const startedAt = Date.now();
  const pollMs = options.pollMs ?? 250;

  while (true) {
    const rejection = options.findRejection();
    if (rejection) return { outcome: 'rejected', rejection };

    const url = options.findPostEvidence();
    if (url) return { outcome: 'confirmed', url };

    if (!options.isDraftOpen()) return { outcome: 'closed' };

    const elapsedMs = Date.now() - startedAt;
    if (elapsedMs >= options.timeoutMs) {
      return options.isDraftOpen()
        ? { outcome: 'uncertain' }
        : { outcome: 'closed' };
    }

    await sleep(Math.min(pollMs, Math.max(1, options.timeoutMs - elapsedMs)));
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
