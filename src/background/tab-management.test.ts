import { describe, expect, it } from 'vitest';
import { summarizeResults } from './tab-management';

describe('summarizeResults', () => {
  it('keeps uncertain posts separate from confirmed failures', () => {
    expect(summarizeResults([
      { success: true },
      { success: false, uncertain: true },
      { success: false },
    ])).toEqual({
      succeeded: 1,
      uncertain: 1,
      failed: 1,
    });
  });
});
