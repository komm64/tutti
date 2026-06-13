import { describe, expect, it } from 'vitest';
import { buildSelectedCompatibilityErrors } from './compatibility';

describe('buildSelectedCompatibilityErrors', () => {
  it('returns only selected platform media errors', () => {
    expect(buildSelectedCompatibilityErrors(
      ['x', 'threads'],
      { threads: 'Short videos are not supported.', bluesky: 'too large' },
      { x: null },
    )).toEqual([
      { platform: 'threads', error: 'Short videos are not supported.' },
    ]);
  });
});
