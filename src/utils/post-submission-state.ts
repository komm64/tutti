import type {
  PostFlowStep,
  PostFlowTrace,
  PostStageTiming,
} from '../messages';

let submissionStarted = false;
let submissionStartedAt: number | undefined;
let currentStep: PostFlowStep | undefined;
let currentStepStartedAt: number | undefined;
let lastCompletedStep: PostFlowStep | undefined;
let failedStep: PostFlowStep | undefined;
let flowStartedAt = 0;
let stageTimings: PostStageTiming[] = [];

const MAX_STAGE_TIMINGS = 64;

export function resetPostSubmissionState(): void {
  submissionStarted = false;
  submissionStartedAt = undefined;
  currentStep = undefined;
  currentStepStartedAt = undefined;
  lastCompletedStep = undefined;
  failedStep = undefined;
  flowStartedAt = Date.now();
  stageTimings = [];
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
  if (currentStep && currentStepStartedAt !== undefined) {
    recordStageTiming(currentStep, currentStepStartedAt, 'failed');
  }
  currentStep = step;
  currentStepStartedAt = Date.now();
}

export function markPostStepCompleted(step: PostFlowStep): void {
  if (currentStep === step && currentStepStartedAt !== undefined) {
    recordStageTiming(step, currentStepStartedAt, 'completed');
  }
  lastCompletedStep = step;
  if (currentStep === step) {
    currentStep = undefined;
    currentStepStartedAt = undefined;
  }
}

export function markPostStepFailed(step?: PostFlowStep): void {
  const resolvedStep = step ?? currentStep ?? failedStep;
  failedStep = resolvedStep;
  if (
    resolvedStep &&
    currentStep === resolvedStep &&
    currentStepStartedAt !== undefined
  ) {
    recordStageTiming(resolvedStep, currentStepStartedAt, 'failed');
    currentStep = undefined;
    currentStepStartedAt = undefined;
  }
}

export function getPostSubmissionTrace(overrides: Partial<PostFlowTrace> = {}): PostFlowTrace {
  const now = Date.now();
  const pendingTiming = currentStep && currentStepStartedAt !== undefined
    ? [{
        step: currentStep,
        durationMs: normalizeDuration(now - currentStepStartedAt),
        outcome: 'failed' as const,
      }]
    : [];
  return {
    submitReached: submissionStarted,
    submissionStartedAt,
    lastCompletedStep,
    failedStep: failedStep ?? currentStep,
    totalDurationMs: normalizeDuration(now - flowStartedAt),
    stageTimings: [...stageTimings, ...pendingTiming],
    ...overrides,
  };
}

function recordStageTiming(
  step: PostFlowStep,
  startedAt: number,
  outcome: PostStageTiming['outcome'],
): void {
  if (stageTimings.length >= MAX_STAGE_TIMINGS) return;
  stageTimings.push({
    step,
    durationMs: normalizeDuration(Date.now() - startedAt),
    outcome,
  });
}

function normalizeDuration(durationMs: number): number {
  return Math.max(0, Math.round(durationMs));
}
