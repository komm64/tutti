import { afterEach, describe, expect, it, vi } from 'vitest';
import { settleThreadsPost } from './threads-post-settlement';

describe('settleThreadsPost', () => {
  afterEach(() => vi.useRealTimers());

  it('never resubmits an unchanged open composer when confirmation is unavailable', async () => {
    vi.useFakeTimers();
    const result = settleThreadsPost({
      timeoutMs: 500,
      pollMs: 25,
      isDraftOpen: () => true,
      findPostEvidence: () => undefined,
      findRejection: () => undefined,
    });

    await vi.advanceTimersByTimeAsync(500);

    await expect(result).resolves.toEqual({ outcome: 'uncertain' });
  });

  it('returns at the single observation deadline', async () => {
    vi.useFakeTimers();
    const result = settleThreadsPost({
      timeoutMs: 500,
      pollMs: 25,
      isDraftOpen: () => true,
      findPostEvidence: () => undefined,
      findRejection: () => undefined,
    });
    const assertion = expect(result).resolves.toEqual({ outcome: 'uncertain' });

    await vi.advanceTimersByTimeAsync(500);

    await assertion;
  });

  it('reports composer closure without conflating it with post confirmation', async () => {
    vi.useFakeTimers();
    let open = true;
    const result = settleThreadsPost({
      timeoutMs: 600,
      pollMs: 25,
      isDraftOpen: () => open,
      findPostEvidence: () => undefined,
      findRejection: () => undefined,
    });

    open = false;
    await vi.advanceTimersByTimeAsync(25);

    await expect(result).resolves.toEqual({ outcome: 'closed' });
  });

  it('stops immediately on an explicit Threads rejection', async () => {
    await expect(settleThreadsPost({
      timeoutMs: 10_000,
      isDraftOpen: () => true,
      findPostEvidence: () => undefined,
      findRejection: () => 'Could not upload this image',
    })).resolves.toEqual({
      outcome: 'rejected',
      rejection: 'Could not upload this image',
    });
  });

  it('confirms a post without claiming that its composer closed', async () => {
    vi.useFakeTimers();
    let evidence: string | undefined;
    const result = settleThreadsPost({
      timeoutMs: 10_000,
      pollMs: 25,
      isDraftOpen: () => true,
      findPostEvidence: () => evidence,
      findRejection: () => undefined,
    });

    await vi.advanceTimersByTimeAsync(50);
    evidence = 'https://www.threads.com/@user/post/confirmed';
    await vi.advanceTimersByTimeAsync(25);

    await expect(result).resolves.toEqual({
      outcome: 'confirmed',
      url: evidence,
    });
  });
});
