import { afterEach, describe, expect, it, vi } from 'vitest';
import { withServiceWorkerKeepAlive } from './service-worker-keepalive';

describe('withServiceWorkerKeepAlive', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('touches an extension API throughout an active operation and stops afterward', async () => {
    vi.useFakeTimers();
    const touch = vi.fn(async () => undefined);
    let finish!: (value: string) => void;
    const operation = new Promise<string>((resolve) => {
      finish = resolve;
    });

    const result = withServiceWorkerKeepAlive(
      () => operation,
      { intervalMs: 20_000, touch },
    );
    await vi.advanceTimersByTimeAsync(60_000);

    expect(touch).toHaveBeenCalledTimes(4);
    finish('done');
    await expect(result).resolves.toBe('done');

    await vi.advanceTimersByTimeAsync(60_000);
    expect(touch).toHaveBeenCalledTimes(4);
  });

  it('clears the keepalive when the operation rejects', async () => {
    vi.useFakeTimers();
    const touch = vi.fn(async () => undefined);

    await expect(withServiceWorkerKeepAlive(
      async () => { throw new Error('failed'); },
      { intervalMs: 20_000, touch },
    )).rejects.toThrow('failed');

    await vi.advanceTimersByTimeAsync(60_000);
    expect(touch).toHaveBeenCalledTimes(1);
  });
});
