import { beforeEach, describe, expect, it } from 'vitest';
import {
  hasPostSubmissionStarted,
  markPostSubmissionStarted,
  resetPostSubmissionState,
} from './post-submission-state';

describe('post submission state', () => {
  beforeEach(() => resetPostSubmissionState());

  it('starts clear', () => {
    expect(hasPostSubmissionStarted()).toBe(false);
  });

  it('records that the irreversible post click happened', () => {
    markPostSubmissionStarted();
    expect(hasPostSubmissionStarted()).toBe(true);
  });

  it('clears the previous request state', () => {
    markPostSubmissionStarted();
    resetPostSubmissionState();
    expect(hasPostSubmissionStarted()).toBe(false);
  });
});
