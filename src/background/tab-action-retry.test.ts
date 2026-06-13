import { describe, expect, it, vi } from 'vitest';
import { isTransientTabActionError, retryTransientTabAction } from './tab-action-retry';

describe('tab action transient retry', () => {
  it('detects Chrome tab edit lock errors', () => {
    expect(isTransientTabActionError(new Error('Tabs cannot be edited right now (user may be dragging a tab).'))).toBe(true);
    expect(isTransientTabActionError(new Error('Some other tab error'))).toBe(false);
  });

  it('retries transient tab edit failures', async () => {
    const action = vi.fn()
      .mockRejectedValueOnce(new Error('Tabs cannot be edited right now (user may be dragging a tab).'))
      .mockResolvedValue('ok');

    await expect(retryTransientTabAction('test tab action', action, {
      attempts: 3,
      baseDelayMs: 0,
    })).resolves.toBe('ok');
    expect(action).toHaveBeenCalledTimes(2);
  });

  it('does not retry non-transient failures', async () => {
    const action = vi.fn().mockRejectedValue(new Error('No tab with id: 123'));

    await expect(retryTransientTabAction('test tab action', action, {
      attempts: 3,
      baseDelayMs: 0,
    })).rejects.toThrow('No tab with id: 123');
    expect(action).toHaveBeenCalledTimes(1);
  });

  it('rethrows the transient failure after the retry budget is exhausted', async () => {
    const action = vi.fn().mockRejectedValue(new Error('Tabs cannot be edited right now (user may be dragging a tab).'));

    await expect(retryTransientTabAction('test tab action', action, {
      attempts: 2,
      baseDelayMs: 0,
    })).rejects.toThrow('Tabs cannot be edited right now');
    expect(action).toHaveBeenCalledTimes(2);
  });
});
