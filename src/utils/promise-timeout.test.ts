import { describe, expect, it, vi } from 'vitest';
import { OperationTimeoutError, withTimeout } from './promise-timeout';

describe('withTimeout', () => {
  it('resolves work that finishes within the budget', async () => {
    await expect(withTimeout(Promise.resolve('ok'), 100, 'quick work'))
      .resolves.toBe('ok');
  });

  it('rejects stalled work and invokes cancellation once', async () => {
    vi.useFakeTimers();
    const onTimeout = vi.fn();
    const result = withTimeout(new Promise<never>(() => {}), 250, 'stalled work', onTimeout);
    const assertion = expect(result).rejects.toEqual(
      new OperationTimeoutError('stalled work', 250),
    );

    await vi.advanceTimersByTimeAsync(250);

    await assertion;
    expect(onTimeout).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });
});
