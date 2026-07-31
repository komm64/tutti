import { describe, expect, it } from 'vitest';
import {
  createTimedOutSurfaceSummary,
  formatSurfaceMatrixOutcome,
  hasSurfaceVideoPreview,
  validateSurfaceResultContract,
} from '../scripts/e2e/surface-posting-matrix-contract.mjs';

describe('Surface posting matrix CLI contract', () => {
  it('does not mistake the X character counter for video upload evidence', () => {
    expect(hasSurfaceVideoPreview({
      videoCount: 0,
      progress: [{ ariaValueNow: '23' }],
    })).toBe(false);
    expect(hasSurfaceVideoPreview({ videoCount: 1, progress: [] })).toBe(true);
  });

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

describe('Surface posting matrix result contract', () => {
  it('preserves completed platform results and identifies only pending platforms', () => {
    const result = {
      platform: 'x',
      success: true,
      preview: true,
    };
    const backgroundState = {
      posting: true,
      postingState: {
        platforms: ['x', 'youtube'],
        pending: ['youtube'],
        done: false,
        results: [result],
      },
    };

    expect(createTimedOutSurfaceSummary({
      caseName: 'video-only',
      iteration: 2,
      platforms: ['x', 'youtube'],
      error: 'timed out after 360000ms',
      backgroundState,
    })).toEqual({
      caseName: 'video-only',
      iteration: 2,
      platforms: ['x', 'youtube'],
      timedOut: true,
      error: 'timed out after 360000ms',
      results: [result],
      completedPlatforms: ['x'],
      pendingPlatforms: ['youtube'],
      backgroundState,
    });
  });

  it('accepts a safe completed preview result recovered after a timeout', () => {
    expect(validateSurfaceResultContract({
      mode: 'preview',
      caseName: 'video-only',
      platform: 'x',
      result: {
        success: true,
        preview: true,
        implementation: {
          revision: 1,
          path: 'next',
        },
        flow: {
          submitReached: false,
          lastCompletedStep: 'verify-login',
        },
      },
    })).toEqual([]);
  });

  it('accepts the explicitly expected legacy X implementation path', () => {
    expect(validateSurfaceResultContract({
      mode: 'post',
      caseName: 'long-text-image',
      platform: 'x',
      expectedImplementationPath: 'legacy',
      result: {
        success: true,
        confirmed: true,
        implementation: {
          revision: 1,
          path: 'legacy',
        },
        url: 'https://x.com/example/status/1',
        flow: {
          submitReached: true,
          lastCompletedStep: 'verify-post',
        },
      },
    })).toEqual([]);
  });

  it('keeps unsafe recovered results visible', () => {
    expect(validateSurfaceResultContract({
      mode: 'preview',
      caseName: 'video-only',
      platform: 'x',
      result: {
        success: true,
        preview: true,
        implementation: {
          revision: 1,
          path: 'next',
        },
        url: 'https://x.com/example/status/1',
        flow: {
          submitReached: true,
          lastCompletedStep: 'click-submit',
        },
      },
    })).toEqual([
      'video-only/x: preview returned URL https://x.com/example/status/1',
      'video-only/x: preview reached submit action',
    ]);
  });

  it('requires confirmation, URL, and submit evidence in post mode', () => {
    expect(validateSurfaceResultContract({
      mode: 'post',
      caseName: 'text-only',
      platform: 'x',
      result: {
        success: true,
        implementation: {
          revision: 1,
          path: 'next',
        },
        flow: {
          submitReached: false,
          lastCompletedStep: 'wait-submit',
        },
      },
    })).toEqual([
      'text-only/x: post result was not confirmed',
      'text-only/x: post URL was not captured',
      'text-only/x: post result did not record submitReached=true',
    ]);
  });

  it('rejects results without background-owned next implementation diagnostics', () => {
    expect(validateSurfaceResultContract({
      mode: 'preview',
      caseName: 'text-only',
      platform: 'x',
      result: {
        success: true,
        preview: true,
        flow: {
          submitReached: false,
          lastCompletedStep: 'wait-submit',
        },
      },
    })).toEqual([
      'text-only/x: missing or invalid next implementation diagnostics',
    ]);
  });
});
