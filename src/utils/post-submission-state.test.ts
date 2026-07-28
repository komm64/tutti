import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getPostSubmissionStartedAt,
  hasPostSubmissionStarted,
  getPostSubmissionTrace,
  markPostSubmissionStarted,
  markPostStepCompleted,
  markPostStepFailed,
  markPostStepStarted,
  resetPostSubmissionState,
} from './post-submission-state';

describe('post submission state', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    resetPostSubmissionState();
  });

  afterEach(() => vi.useRealTimers());

  it('starts clear', () => {
    expect(hasPostSubmissionStarted()).toBe(false);
  });

  it('records that the irreversible post click happened', () => {
    markPostSubmissionStarted(12345);
    expect(hasPostSubmissionStarted()).toBe(true);
    expect(getPostSubmissionStartedAt()).toBe(12345);
    expect(getPostSubmissionTrace()).toMatchObject({
      submitReached: true,
      submissionStartedAt: 12345,
      lastCompletedStep: 'click-submit',
    });
  });

  it('clears the previous request state', () => {
    markPostSubmissionStarted();
    resetPostSubmissionState();
    expect(hasPostSubmissionStarted()).toBe(false);
    expect(getPostSubmissionTrace()).toEqual({
      submitReached: false,
      submissionStartedAt: undefined,
      lastCompletedStep: undefined,
      failedStep: undefined,
      totalDurationMs: 0,
      stageTimings: [],
    });
  });

  it('records the active and failed flow step', () => {
    markPostStepStarted('attach-media');
    expect(getPostSubmissionTrace()).toMatchObject({
      submitReached: false,
      failedStep: 'attach-media',
    });
    markPostStepFailed();
    expect(getPostSubmissionTrace().failedStep).toBe('attach-media');
    markPostStepCompleted('attach-media');
    expect(getPostSubmissionTrace()).toMatchObject({
      lastCompletedStep: 'attach-media',
      failedStep: 'attach-media',
    });
  });

  it('records completed and failed stage durations without content data', () => {
    markPostStepStarted('inject-text');
    vi.setSystemTime(1_125);
    markPostStepCompleted('inject-text');
    markPostStepStarted('attach-media');
    vi.setSystemTime(1_400);
    markPostStepFailed();

    expect(getPostSubmissionTrace()).toMatchObject({
      totalDurationMs: 400,
      stageTimings: [
        { step: 'inject-text', durationMs: 125, outcome: 'completed' },
        { step: 'attach-media', durationMs: 275, outcome: 'failed' },
      ],
    });
  });
});
