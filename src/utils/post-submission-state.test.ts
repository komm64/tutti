import { beforeEach, describe, expect, it } from 'vitest';
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
  beforeEach(() => resetPostSubmissionState());

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
});
