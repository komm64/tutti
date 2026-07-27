import { describe, expect, it, vi } from 'vitest';
import type { PlatformId, PostRequestIntent } from '../messages';
import type { HistoryEntry } from '../storage';
import {
  createSubmissionGuard,
  RECENT_DUPLICATE_WINDOW_MS,
  type SubmissionGuardInput,
} from './submission-guard';

const NOW = 1_000_000;
const FINGERPRINT = 'f'.repeat(64);

describe('SubmissionGuard', () => {
  it('bypasses fingerprint, History, and in-flight dedup for preview', async () => {
    const computeFingerprint = vi.fn(async () => {
      throw new Error('must not run');
    });
    const getHistory = vi.fn(async () => {
      throw new Error('must not run');
    });
    const guard = createSubmissionGuard({ computeFingerprint, getHistory });

    const first = await guard.reserve(input({
      autoPost: false,
      platforms: ['x', 'x', 'threads'],
    }));
    const second = await guard.reserve(input({
      autoPost: false,
      requestId: 'preview-2',
      platforms: ['x'],
    }));

    expect(first.decisions).toEqual([
      { platform: 'x', decision: 'allow' },
      { platform: 'threads', decision: 'allow' },
    ]);
    expect(second.allowedPlatforms).toEqual(['x']);
    expect(first.fingerprint).toBeUndefined();
    expect(first.rejectedResults).toEqual([]);
    expect(computeFingerprint).not.toHaveBeenCalled();
    expect(getHistory).not.toHaveBeenCalled();
  });

  it('lets new requests ignore recent History but blocks the same in-flight platform', async () => {
    const getHistory = vi.fn(async () => [
      history({ x: { success: true } }),
    ]);
    const guard = createSubmissionGuard({
      computeFingerprint: async () => FINGERPRINT,
      getHistory,
      now: () => NOW,
    });

    const first = await guard.reserve(input({ intent: 'new', platforms: ['x'] }));
    const blocked = await guard.reserve(input({
      requestId: 'new-2',
      intent: 'new',
      platforms: ['x'],
    }));
    blocked.release();
    const stillBlocked = await guard.reserve(input({
      requestId: 'new-3',
      intent: 'new',
      platforms: ['x'],
    }));
    first.release();
    const afterRelease = await guard.reserve(input({
      requestId: 'new-4',
      intent: 'new',
      platforms: ['x'],
    }));

    expect(first.allowedPlatforms).toEqual(['x']);
    expect(blocked.decisions[0]).toMatchObject({ decision: 'blocked', reason: 'in-flight' });
    expect(stillBlocked.decisions[0]).toMatchObject({ decision: 'blocked', reason: 'in-flight' });
    expect(afterRelease.allowedPlatforms).toEqual(['x']);
    expect(getHistory).not.toHaveBeenCalled();
    afterRelease.release();
  });

  it('blocks only colliding in-flight platforms and reserves unrelated ones', async () => {
    const guard = createSubmissionGuard({
      computeFingerprint: async () => FINGERPRINT,
    });
    const first = await guard.reserve(input({ platforms: ['x'] }));
    const second = await guard.reserve(input({
      requestId: 'request-2',
      platforms: ['x', 'threads'],
    }));

    expect(second.decisions).toEqual([
      { platform: 'x', decision: 'blocked', reason: 'in-flight' },
      { platform: 'threads', decision: 'allow' },
    ]);
    expect(second.allowedPlatforms).toEqual(['threads']);

    first.release();
    second.release();
  });

  it.each<PostRequestIntent>(['retry', 'history-repost'])(
    '%s applies recent History per platform without stopping safe platforms',
    async (intent) => {
      const guard = createSubmissionGuard({
        computeFingerprint: async () => FINGERPRINT,
        getHistory: async () => [history({
          x: { success: true },
          threads: { success: false, uncertain: true },
          bluesky: { success: false },
        })],
        now: () => NOW,
      });

      const reservation = await guard.reserve(input({
        intent,
        platforms: ['x', 'threads', 'bluesky'],
      }));

      expect(reservation.decisions).toEqual([
        { platform: 'x', decision: 'blocked', reason: 'recent-success' },
        { platform: 'threads', decision: 'indeterminate', reason: 'recent-uncertain' },
        { platform: 'bluesky', decision: 'allow' },
      ]);
      expect(reservation.allowedPlatforms).toEqual(['bluesky']);
      expect(reservation.rejectedResults).toEqual([
        expect.objectContaining({
          platform: 'x',
          success: false,
          submissionGuard: expect.objectContaining({
            decision: 'blocked',
            reason: 'recent-success',
          }),
          flow: expect.objectContaining({ submitReached: false }),
        }),
        expect.objectContaining({
          platform: 'threads',
          success: false,
          uncertain: true,
          userAction: 'check-post-before-retry',
          submissionGuard: expect.objectContaining({
            decision: 'indeterminate',
            reason: 'recent-uncertain',
          }),
          flow: expect.objectContaining({ submitReached: false }),
        }),
      ]);
      reservation.release();
    },
  );

  it('ignores matching History outside the recent window', async () => {
    const guard = createSubmissionGuard({
      computeFingerprint: async () => FINGERPRINT,
      getHistory: async () => [history(
        { x: { success: true } },
        NOW - RECENT_DUPLICATE_WINDOW_MS - 1,
      )],
      now: () => NOW,
    });

    const reservation = await guard.reserve(input({ intent: 'retry', platforms: ['x'] }));

    expect(reservation.allowedPlatforms).toEqual(['x']);
    reservation.release();
  });

  it('fails closed when the fingerprint cannot be computed', async () => {
    const getHistory = vi.fn(async () => []);
    const guard = createSubmissionGuard({
      computeFingerprint: async () => {
        throw new Error('missing transfer');
      },
      getHistory,
    });

    const reservation = await guard.reserve(input({
      intent: 'new',
      platforms: ['x', 'threads'],
    }));

    expect(reservation.decisions).toEqual([
      { platform: 'x', decision: 'indeterminate', reason: 'fingerprint-unavailable' },
      { platform: 'threads', decision: 'indeterminate', reason: 'fingerprint-unavailable' },
    ]);
    expect(reservation.allowedPlatforms).toEqual([]);
    expect(getHistory).not.toHaveBeenCalled();
  });

  it.each<PostRequestIntent>(['retry', 'history-repost'])(
    '%s fails closed when History cannot be read',
    async (intent) => {
      const guard = createSubmissionGuard({
        computeFingerprint: async () => FINGERPRINT,
        getHistory: async () => {
          throw new Error('storage unavailable');
        },
      });

      const reservation = await guard.reserve(input({ intent, platforms: ['x'] }));

      expect(reservation.decisions[0]).toEqual({
        platform: 'x',
        decision: 'indeterminate',
        reason: 'history-unavailable',
      });
      expect(reservation.rejectedResults[0]).toMatchObject({
        uncertain: true,
        flow: { mode: 'post', submitReached: false, failedStep: 'submission-guard' },
      });
    },
  );
});

function input(overrides: Partial<SubmissionGuardInput> = {}): SubmissionGuardInput {
  return {
    requestId: 'request-1',
    intent: 'new',
    text: 'same post',
    platforms: ['x'],
    autoPost: true,
    ...overrides,
  };
}

function history(
  results: Partial<Record<PlatformId, HistoryEntry['results'][PlatformId]>>,
  timestamp = NOW - 1,
): HistoryEntry {
  return {
    version: 1,
    id: 'history-1',
    textPreview: 'same post',
    text: 'same post',
    bodyHash: FINGERPRINT,
    platforms: Object.keys(results) as PlatformId[],
    results,
    hasMedia: false,
    timestamp,
  };
}
