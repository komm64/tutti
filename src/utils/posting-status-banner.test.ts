import { describe, expect, it } from 'vitest';
import {
  POSTING_STEP_SLOW_MS,
  buildPostingStatusView,
  classifyPostingStep,
  formatElapsed,
} from './posting-status-banner';

describe('classifyPostingStep', () => {
  it.each([
    [undefined, 'prepare'],
    ['verify-login', 'prepare'],
    ['open-upload-modal', 'prepare'],
    ['set-not-for-kids:advance', 'prepare'],
    ['inject-video', 'media'],
    ['attach-media', 'media'],
    ['inject-image:await-next', 'media'],
    ['fill-title', 'text'],
    ['inject-text', 'text'],
    ['wait-submit', 'submit'],
    ['click-submit', 'submit'],
    ['publish-completion', 'confirm'],
    ['complete-confirmation', 'confirm'],
    ['post-processing', 'confirm'],
    ['something-new', 'working'],
  ])('%s -> %s', (step, phase) => {
    expect(classifyPostingStep(step)).toBe(phase);
  });
});

describe('formatElapsed', () => {
  it.each([
    [0, '0:00'],
    [9_999, '0:09'],
    [65_000, '1:05'],
    [-5, '0:00'],
  ])('%d ms -> %s', (ms, text) => {
    expect(formatElapsed(ms)).toBe(text);
  });
});

describe('buildPostingStatusView', () => {
  it('flags only an active step that exceeds the slow threshold', () => {
    const now = 1_000_000;
    const base = { flowStartedAt: now - 90_000, submitted: false };
    expect(buildPostingStatusView('YouTube', false, {
      ...base,
      step: 'inject-video',
      stepStartedAt: now - POSTING_STEP_SLOW_MS,
    }, now).slow).toBe(true);
    expect(buildPostingStatusView('YouTube', false, {
      ...base,
      step: 'inject-video',
      stepStartedAt: now - 1_000,
    }, now).slow).toBe(false);
    // A completed step has no start time; waiting between steps is not "slow".
    expect(buildPostingStatusView('YouTube', false, {
      ...base,
      step: 'inject-video',
    }, now).slow).toBe(false);
  });
});
