import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  elementTextMatches,
  findClickableByText,
  isElementDisabled,
  normalizeElementText,
  waitForCondition,
  waitForStableCondition,
} from './dom';

function el(options: {
  text?: string;
  aria?: string;
  disabled?: boolean;
  ariaDisabled?: string;
}): HTMLElement {
  return {
    textContent: options.text ?? '',
    getAttribute: (name: string) => {
      if (name === 'aria-label') return options.aria ?? null;
      if (name === 'aria-disabled') return options.ariaDisabled ?? null;
      return null;
    },
    disabled: options.disabled ?? false,
  } as unknown as HTMLElement;
}

describe('DOM text helpers', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('normalizes button text whitespace before matching', () => {
    expect(normalizeElementText('  Next\n\t')).toBe('Next');
    expect(elementTextMatches(el({ text: ' Next\n' }), ['Next'])).toBe(true);
  });

  it('falls back to aria-label text when textContent is empty', () => {
    expect(elementTextMatches(el({ aria: 'Next' }), ['Next'])).toBe(true);
  });

  it('detects native and aria disabled buttons', () => {
    expect(isElementDisabled(el({ disabled: true }))).toBe(true);
    expect(isElementDisabled(el({ ariaDisabled: 'true' }))).toBe(true);
    expect(isElementDisabled(el({ text: 'Next' }))).toBe(false);
  });

  it('findClickableByText uses normalized text', () => {
    vi.stubGlobal('document', {
      querySelectorAll: () => [
        el({ text: 'Back' }),
        el({ text: '  Next\n' }),
      ],
    });

    expect(findClickableByText('Next')?.textContent).toBe('  Next\n');
  });

  it('resolves after the same event-driven candidate stays stable', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const first = {};
    const second = {};
    let candidate: object | null = first;
    const waiting = waitForStableCondition(
      () => candidate,
      {
        timeoutMs: 1_000,
        quietMs: 100,
        intervalMs: 10,
        root: null,
        observerInit: false,
      },
    );

    await vi.advanceTimersByTimeAsync(70);
    candidate = second;
    await vi.advanceTimersByTimeAsync(90);
    let settled = false;
    void waiting.then(() => { settled = true; });
    await Promise.resolve();
    expect(settled).toBe(false);

    await vi.advanceTimersByTimeAsync(20);
    await expect(waiting).resolves.toBe(second);
  });

  it('does not consume timeout budget while the caller is paused', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    let paused = true;
    let ready = false;
    const waiting = waitForCondition(
      () => ready ? 'ready' : null,
      {
        timeoutMs: 100,
        intervalMs: 10,
        root: null,
        observerInit: false,
        pauseTimeoutWhile: () => paused,
      },
    );

    await vi.advanceTimersByTimeAsync(500);
    let settled = false;
    void waiting.then(() => { settled = true; });
    await Promise.resolve();
    expect(settled).toBe(false);

    paused = false;
    await vi.advanceTimersByTimeAsync(80);
    expect(settled).toBe(false);
    ready = true;
    await vi.advanceTimersByTimeAsync(10);
    await expect(waiting).resolves.toBe('ready');
  });
});
