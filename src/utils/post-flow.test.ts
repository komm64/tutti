import { afterEach, describe, expect, it, vi } from 'vitest';
import { maybeConfirmDialog } from './post-flow';

describe('maybeConfirmDialog', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns after the short grace period when no dialog appears', async () => {
    vi.stubGlobal('document', {
      querySelector: () => null,
    });
    const start = Date.now();
    await maybeConfirmDialog(['Post anyway'], 10);
    expect(Date.now() - start).toBeLessThan(500);
  });
});
