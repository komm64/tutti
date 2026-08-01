import { sleep } from './dom';
import {
  markPostStepCompleted,
  markPostStepFailed,
  markPostStepStarted,
} from './post-submission-state';

/**
 * Give the fully prepared composer a short, bounded settle window before the
 * irreversible submit action. The floor prevents zero-time state transitions;
 * the small jitter keeps simultaneous cross-platform lanes from producing one
 * synchronized request burst.
 */
export const PRE_SUBMIT_MIN_DELAY_MS = 900;
export const PRE_SUBMIT_JITTER_MS = 600;

export interface PreSubmitPacingOptions {
  random?: () => number;
  wait?: (delayMs: number) => Promise<void>;
}

export function resolvePreSubmitDelayMs(randomValue: number): number {
  const bounded = Number.isFinite(randomValue)
    ? Math.min(1, Math.max(0, randomValue))
    : 0;
  return PRE_SUBMIT_MIN_DELAY_MS + Math.floor(bounded * PRE_SUBMIT_JITTER_MS);
}

export async function waitForPreSubmitPacing(
  options: PreSubmitPacingOptions = {},
): Promise<number> {
  const delayMs = resolvePreSubmitDelayMs((options.random ?? Math.random)());
  markPostStepStarted('pre-submit-pacing');
  try {
    await (options.wait ?? sleep)(delayMs);
    markPostStepCompleted('pre-submit-pacing');
    return delayMs;
  } catch (error) {
    markPostStepFailed('pre-submit-pacing');
    throw error;
  }
}
