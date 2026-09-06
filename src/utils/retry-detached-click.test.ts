import { describe, expect, it, vi } from 'vitest';
import { retryDetachedClick } from './retry-detached-click';

describe('retryDetachedClick', () => {
  it('reacquires once when the marked page-world target was detached', async () => {
    const click = vi.fn()
      .mockRejectedValueOnce(new Error('click target not found'))
      .mockResolvedValueOnce('opened');
    const beforeRetry = vi.fn().mockResolvedValue(undefined);

    await expect(retryDetachedClick(click, beforeRetry)).resolves.toBe('opened');
    expect(click).toHaveBeenCalledTimes(2);
    expect(beforeRetry).toHaveBeenCalledTimes(1);
  });

  it('does not retry other failures', async () => {
    const click = vi.fn().mockRejectedValue(new Error('permission denied'));
    const beforeRetry = vi.fn().mockResolvedValue(undefined);

    await expect(retryDetachedClick(click, beforeRetry)).rejects.toThrow('permission denied');
    expect(click).toHaveBeenCalledTimes(1);
    expect(beforeRetry).not.toHaveBeenCalled();
  });

  it('does not turn a second missing-target failure into an unbounded retry', async () => {
    const click = vi.fn().mockRejectedValue(new Error('click target not found'));

    await expect(retryDetachedClick(click)).rejects.toThrow('click target not found');
    expect(click).toHaveBeenCalledTimes(2);
  });
});
