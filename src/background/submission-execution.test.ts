import { describe, expect, it, vi } from 'vitest';
import { executeGuardedSubmission } from './submission-execution';

describe('executeGuardedSubmission', () => {
  it('reserves before starting work and releases after success', async () => {
    const events: string[] = [];

    await expect(executeGuardedSubmission({
      reserve: async () => {
        events.push('reserve');
        return { release: () => events.push('release') };
      },
      run: async () => {
        events.push('run');
        return 'done';
      },
      cleanup: async () => {
        events.push('cleanup');
      },
    })).resolves.toBe('done');

    expect(events).toEqual(['reserve', 'run', 'release', 'cleanup']);
  });

  it('releases the reservation and request resources when posting throws', async () => {
    const release = vi.fn();
    const cleanup = vi.fn(async () => {});

    await expect(executeGuardedSubmission({
      reserve: async () => ({ release }),
      run: async () => {
        throw new Error('post failed');
      },
      cleanup,
    })).rejects.toThrow('post failed');

    expect(release).toHaveBeenCalledOnce();
    expect(cleanup).toHaveBeenCalledOnce();
  });

  it('still cleans request resources if reservation itself fails', async () => {
    const run = vi.fn();
    const cleanup = vi.fn(async () => {});

    await expect(executeGuardedSubmission({
      reserve: async () => {
        throw new Error('guard failed');
      },
      run,
      cleanup,
    })).rejects.toThrow('guard failed');

    expect(run).not.toHaveBeenCalled();
    expect(cleanup).toHaveBeenCalledOnce();
  });
});
