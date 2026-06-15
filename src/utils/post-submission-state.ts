import type { PostFlowStep, PostFlowTrace } from '../messages';

let submissionStarted = false;
let submissionStartedAt: number | undefined;
let currentStep: PostFlowStep | undefined;
let lastCompletedStep: PostFlowStep | undefined;
let failedStep: PostFlowStep | undefined;

export function resetPostSubmissionState(): void {
  submissionStarted = false;
  submissionStartedAt = undefined;
  currentStep = undefined;
  lastCompletedStep = undefined;
  failedStep = undefined;
}

export function markPostSubmissionStarted(startedAt = Date.now()): void {
  submissionStarted = true;
  submissionStartedAt = startedAt;
  markPostStepCompleted('click-submit');
}

export function hasPostSubmissionStarted(): boolean {
  return submissionStarted;
}

export function getPostSubmissionStartedAt(): number | undefined {
  return submissionStartedAt;
}

export function markPostStepStarted(step: PostFlowStep): void {
  currentStep = step;
}

export function markPostStepCompleted(step: PostFlowStep): void {
  lastCompletedStep = step;
  if (currentStep === step) currentStep = undefined;
}

export function markPostStepFailed(step?: PostFlowStep): void {
  failedStep = step ?? currentStep ?? failedStep;
}

export function getPostSubmissionTrace(overrides: Partial<PostFlowTrace> = {}): PostFlowTrace {
  return {
    submitReached: submissionStarted,
    submissionStartedAt,
    lastCompletedStep,
    failedStep: failedStep ?? currentStep,
    ...overrides,
  };
}
