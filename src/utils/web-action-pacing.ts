import { sleep } from './dom';
import {
  markPostStepCompleted,
  markPostStepFailed,
  markPostStepStarted,
} from './post-submission-state';

export type WebActionKind =
  | 'navigation'
  | 'interaction'
  | 'input'
  | 'media'
  | 'submit';

export interface WebActionPacingProfile {
  minDelayMs: number;
  jitterMs: number;
}

/**
 * Bounded pacing for logical web mutations. Reads, readiness polling, and the
 * synthetic events inside one editor command are deliberately excluded.
 */
export const WEB_ACTION_PACING: Readonly<Record<WebActionKind, WebActionPacingProfile>> = {
  navigation: { minDelayMs: 350, jitterMs: 650 },
  interaction: { minDelayMs: 250, jitterMs: 500 },
  input: { minDelayMs: 300, jitterMs: 500 },
  media: { minDelayMs: 450, jitterMs: 750 },
  submit: { minDelayMs: 900, jitterMs: 600 },
};

export interface WebActionPacingOptions {
  random?: () => number;
  wait?: (delayMs: number) => Promise<void>;
}

export function resolveWebActionDelayMs(
  kind: WebActionKind,
  randomValue: number,
): number {
  const profile = WEB_ACTION_PACING[kind];
  const bounded = Number.isFinite(randomValue)
    ? Math.min(1, Math.max(0, randomValue))
    : 0;
  return profile.minDelayMs + Math.floor(bounded * profile.jitterMs);
}

export async function waitForWebActionPacing(
  kind: WebActionKind,
  options: WebActionPacingOptions = {},
): Promise<number> {
  const delayMs = resolveWebActionDelayMs(kind, (options.random ?? Math.random)());
  const step = `web-action-pacing:${kind}`;
  markPostStepStarted(step);
  try {
    await (options.wait ?? sleep)(delayMs);
    markPostStepCompleted(step);
    return delayMs;
  } catch (error) {
    markPostStepFailed(step);
    throw error;
  }
}

export async function clickElementWithPacing(
  element: HTMLElement,
  kind: WebActionKind = 'interaction',
  options: WebActionPacingOptions = {},
): Promise<void> {
  await waitForWebActionPacing(kind, options);
  element.click();
}
