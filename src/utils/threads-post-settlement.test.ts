import { afterEach, describe, expect, it, vi } from 'vitest';
import { settleThreadsPost } from './threads-post-settlement';

describe('settleThreadsPost', () => {
  afterEach(() => vi.useRealTimers());

  it('retries an enabled unchanged draft twice inside one bounded wait', async () => {
    vi.useFakeTimers();
    let open = true;
    const retrySubmit = vi.fn(async () => {
      if (retrySubmit.mock.calls.length === 2) open = false;
    });
    const result = settleThreadsPost({
      timeoutMs: 1_000,
      retryAtMs: [100, 250],
      pollMs: 25,
      isDraftOpen: () => open,
      findRejection: () => undefined,
      canRetry: () => true,
      retrySubmit,
    });

    await vi.advanceTimersByTimeAsync(300);

    await expect(result).resolves.toEqual({ closed: true, retries: 2 });
    expect(retrySubmit).toHaveBeenCalledTimes(2);
  });

  it('returns at the single deadline instead of stacking retry waits', async () => {
    vi.useFakeTimers();
    const result = settleThreadsPost({
      timeoutMs: 500,
      retryAtMs: [100, 200],
      pollMs: 25,
      isDraftOpen: () => true,
      findRejection: () => undefined,
      canRetry: () => false,
      retrySubmit: vi.fn(async () => undefined),
    });
    const assertion = expect(result).resolves.toEqual({ closed: false, retries: 0 });

    await vi.advanceTimersByTimeAsync(500);

    await assertion;
  });

  it('does not fire two retries back-to-back when the button enables late', async () => {
    vi.useFakeTimers();
    let retryEnabled = false;
    const retrySubmit = vi.fn(async () => undefined);
    const result = settleThreadsPost({
      timeoutMs: 600,
      retryAtMs: [100, 300],
      pollMs: 25,
      isDraftOpen: () => true,
      findRejection: () => undefined,
      canRetry: () => retryEnabled,
      retrySubmit,
    });

    await vi.advanceTimersByTimeAsync(350);
    retryEnabled = true;
    await vi.advanceTimersByTimeAsync(25);
    expect(retrySubmit).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(199);
    expect(retrySubmit).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(1);
    expect(retrySubmit).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(25);
    await expect(result).resolves.toEqual({ closed: false, retries: 2 });
  });

  it('stops immediately on an explicit Threads rejection', async () => {
    await expect(settleThreadsPost({
      timeoutMs: 10_000,
      isDraftOpen: () => true,
      findRejection: () => 'Could not upload this image',
      canRetry: () => true,
      retrySubmit: vi.fn(async () => undefined),
    })).resolves.toEqual({
      closed: false,
      retries: 0,
      rejection: 'Could not upload this image',
    });
  });
});
