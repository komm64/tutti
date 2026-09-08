import { sleep } from './dom';
import { measurePostStage } from './post-submission-state';

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
  return measurePostStage(`web-action-pacing:${kind}`, async () => {
    await (options.wait ?? sleep)(delayMs);
    return delayMs;
  });
}

export async function clickElementWithPacing(
  element: HTMLElement,
  kind: WebActionKind = 'interaction',
  options: WebActionPacingOptions = {},
): Promise<void> {
  await waitForWebActionPacing(kind, options);
  element.click();
}
