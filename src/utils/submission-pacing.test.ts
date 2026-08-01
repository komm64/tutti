import { describe, expect, it, vi } from 'vitest';
import {
  PRE_SUBMIT_JITTER_MS,
  PRE_SUBMIT_MIN_DELAY_MS,
  resolvePreSubmitDelayMs,
  waitForPreSubmitPacing,
} from './submission-pacing';
import {
  getPostSubmissionTrace,
  resetPostSubmissionState,
} from './post-submission-state';

describe('pre-submit pacing', () => {
  it('keeps the randomized delay inside a small bounded window', () => {
    expect(resolvePreSubmitDelayMs(-1)).toBe(PRE_SUBMIT_MIN_DELAY_MS);
    expect(resolvePreSubmitDelayMs(0)).toBe(PRE_SUBMIT_MIN_DELAY_MS);
    expect(resolvePreSubmitDelayMs(0.5)).toBe(
      PRE_SUBMIT_MIN_DELAY_MS + Math.floor(PRE_SUBMIT_JITTER_MS / 2),
    );
    expect(resolvePreSubmitDelayMs(1)).toBe(
      PRE_SUBMIT_MIN_DELAY_MS + PRE_SUBMIT_JITTER_MS,
    );
    expect(resolvePreSubmitDelayMs(Number.NaN)).toBe(PRE_SUBMIT_MIN_DELAY_MS);
  });

  it('waits for the resolved delay and returns it', async () => {
    const wait = vi.fn(async () => undefined);
    resetPostSubmissionState();

    await expect(waitForPreSubmitPacing({
      random: () => 0.25,
      wait,
    })).resolves.toBe(PRE_SUBMIT_MIN_DELAY_MS + 150);

    expect(wait).toHaveBeenCalledOnce();
    expect(wait).toHaveBeenCalledWith(PRE_SUBMIT_MIN_DELAY_MS + 150);
    expect(getPostSubmissionTrace().stageTimings).toEqual([
      expect.objectContaining({
        step: 'pre-submit-pacing',
        outcome: 'completed',
      }),
    ]);
  });
});
