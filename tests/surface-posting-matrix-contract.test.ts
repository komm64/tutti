import { describe, expect, it } from 'vitest';
import { formatSurfaceMatrixOutcome } from '../scripts/e2e/surface-posting-matrix-contract.mjs';

describe('Surface posting matrix CLI contract', () => {
  it('keeps the successful release-gate output and exit code stable', () => {
    expect(formatSurfaceMatrixOutcome([])).toEqual({
      passed: true,
      exitCode: 0,
      stdout: ['\n[matrix] PASS'],
      stderr: [],
    });
  });

  it('keeps failure ordering, indentation, and exit code stable', () => {
    expect(formatSurfaceMatrixOutcome([
      'text-only/x: preview reached submit action',
      'text-image/threads: post URL missing',
    ])).toEqual({
      passed: false,
      exitCode: 1,
      stdout: [],
      stderr: [
        '\n[matrix] FAIL',
        '  - text-only/x: preview reached submit action',
        '  - text-image/threads: post URL missing',
      ],
    });
  });
});
