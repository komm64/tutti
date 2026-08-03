import { describe, expect, it, vi } from 'vitest';
import {
  WEB_ACTION_PACING,
  clickElementWithPacing,
  resolveWebActionDelayMs,
  waitForWebActionPacing,
  type WebActionKind,
} from './web-action-pacing';
import {
  getPostSubmissionTrace,
  resetPostSubmissionState,
} from './post-submission-state';

describe('web action pacing', () => {
  it.each<WebActionKind>([
    'navigation',
    'interaction',
    'input',
    'media',
    'submit',
  ])('keeps %s inside its bounded random window', (kind) => {
    const profile = WEB_ACTION_PACING[kind];
    expect(resolveWebActionDelayMs(kind, -1)).toBe(profile.minDelayMs);
    expect(resolveWebActionDelayMs(kind, 0)).toBe(profile.minDelayMs);
    expect(resolveWebActionDelayMs(kind, 0.5)).toBe(
      profile.minDelayMs + Math.floor(profile.jitterMs / 2),
    );
    expect(resolveWebActionDelayMs(kind, 1)).toBe(
      profile.minDelayMs + profile.jitterMs,
    );
    expect(resolveWebActionDelayMs(kind, Number.NaN)).toBe(profile.minDelayMs);
  });

  it('waits for and traces the selected logical action', async () => {
    const wait = vi.fn(async () => undefined);
    resetPostSubmissionState();

    const expected = WEB_ACTION_PACING.media.minDelayMs +
      Math.floor(WEB_ACTION_PACING.media.jitterMs * 0.25);
    await expect(waitForWebActionPacing('media', {
      random: () => 0.25,
      wait,
    })).resolves.toBe(expected);

    expect(wait).toHaveBeenCalledWith(expected);
    expect(getPostSubmissionTrace().stageTimings).toEqual([
      expect.objectContaining({
        step: 'web-action-pacing:media',
        outcome: 'completed',
      }),
    ]);
  });

  it('paces before clicking an element', async () => {
    const order: string[] = [];
    const element = {
      click: () => { order.push('click'); },
    } as HTMLElement;

    await clickElementWithPacing(element, 'interaction', {
      random: () => 0,
      wait: async () => { order.push('wait'); },
    });

    expect(order).toEqual(['wait', 'click']);
  });
});
