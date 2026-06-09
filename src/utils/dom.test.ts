import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  elementTextMatches,
  findClickableByText,
  isElementDisabled,
  normalizeElementText,
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
});

