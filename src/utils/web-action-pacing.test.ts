import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  WEB_ACTION_PACING,
  clickElementWithPacing,
  resolveWebActionDelayMs,
  waitForWebActionPacing,
  type WebActionKind,
} from './web-action-pacing';
import {
  getPostSubmissionTrace,
  markPostStepStarted,
  markPostStepCompleted,
  resetPostSubmissionState,
} from './post-submission-state';

describe('web action pacing', () => {
  afterEach(() => vi.useRealTimers());

  it('preserves the parent step while measuring a nested wait', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    resetPostSubmissionState();
    markPostStepStarted('attach-media');

    await waitForWebActionPacing('media', {
      random: () => 0,
      wait: async () => { vi.setSystemTime(1_450); },
    });
    expect(getPostSubmissionTrace().failedStep).toBe('attach-media');
    expect(getPostSubmissionTrace().lastCompletedStep).toBeUndefined();
    vi.setSystemTime(1_900);
    markPostStepCompleted('attach-media');

    expect(getPostSubmissionTrace()).toMatchObject({
      lastCompletedStep: 'attach-media',
      failedStep: undefined,
      stageTimings: [
        { step: 'web-action-pacing:media', durationMs: 450, outcome: 'completed' },
        { step: 'attach-media', durationMs: 900, outcome: 'completed' },
      ],
    });
  });

  it('keeps a real pacing failure visible without losing its parent timing', async () => {
    resetPostSubmissionState();
    markPostStepStarted('inject-text');

    await expect(waitForWebActionPacing('input', {
      wait: async () => { throw new Error('wait failed'); },
    })).rejects.toThrow('wait failed');

    expect(getPostSubmissionTrace()).toMatchObject({
      failedStep: 'web-action-pacing:input',
      stageTimings: [
        expect.objectContaining({ step: 'web-action-pacing:input', outcome: 'failed' }),
        expect.objectContaining({ step: 'inject-text', outcome: 'failed' }),
      ],
    });
  });

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
