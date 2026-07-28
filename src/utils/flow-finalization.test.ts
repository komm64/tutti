import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  finalizeFlow,
  findFlowButton,
  highlightPreviewButton,
  maybeConfirmDialog,
  waitForSubmitButton,
} from './flow-finalization';

function button(options: {
  disabled?: boolean;
  label?: string;
  onClick?: () => void;
} = {}): HTMLElement {
  return {
    textContent: options.label ?? '',
    getAttribute: vi.fn(() => null),
    disabled: options.disabled ?? false,
    click: options.onClick ?? vi.fn(),
    style: { outline: '' },
  } as unknown as HTMLElement;
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('flow button resolution', () => {
  it('preserves finder, selector-list, then text priority', () => {
    const finderButton = button();
    const selectorButton = button();
    vi.stubGlobal('document', {
      querySelector: vi.fn(() => selectorButton),
      querySelectorAll: vi.fn(() => [selectorButton]),
    });

    expect(findFlowButton({
      finder: () => finderButton,
      selector: '.submit',
      texts: ['Post'],
    })).toBe(finderButton);
  });

  it('can choose an enabled later selector match while retaining the first fallback', () => {
    const disabledButton = button({ disabled: true });
    const enabledButton = button();
    vi.stubGlobal('document', {
      querySelectorAll: vi.fn((selector: string) => (
        selector === '.primary' ? [disabledButton] : [enabledButton]
      )),
    });

    expect(findFlowButton({
      selector: '.primary, .secondary',
    }, {
      preferEnabledSelectorMatch: true,
    })).toBe(enabledButton);
  });

  it('returns the last disabled candidate when submit waiting times out', async () => {
    const disabledButton = button({ disabled: true });

    const result = await waitForSubmitButton({
      finder: () => disabledButton,
    }, 10);

    expect(result).toEqual({
      button: null,
      lastFound: disabledButton,
    });
  });
});

describe('flow finalization', () => {
  it('highlights previews without clicking and restores the outline', async () => {
    vi.useFakeTimers();
    const previewButton = button();
    vi.spyOn(console, 'log').mockImplementation(() => undefined);

    highlightPreviewButton(previewButton, 'preview');
    expect(previewButton.style.outline).toBe('3px dashed #f59e0b');

    await vi.advanceTimersByTimeAsync(5000);
    expect(previewButton.style.outline).toBe('');
  });

  it('runs custom click, confirmation, and post-processing in order', async () => {
    vi.useFakeTimers();
    const events: string[] = [];
    const submitButton = button();
    const confirmButton = button({
      label: 'Post anyway',
      onClick: () => events.push('confirm'),
    });
    const dialog = {
      querySelector: vi.fn(() => null),
      querySelectorAll: vi.fn(() => [confirmButton]),
    } as unknown as HTMLElement;
    vi.stubGlobal('document', {
      querySelectorAll: vi.fn((selector: string) => (
        selector === '[role="dialog"]' ? [dialog] : []
      )),
    });
    vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const result = finalizeFlow({
      button: submitButton,
      click: () => {
        events.push('submit');
      },
      confirmDialogButtonTexts: ['Post anyway'],
      confirmDialogGraceMs: 10,
      afterClickDelayMs: 25,
    });
    await vi.runAllTimersAsync();
    await result;

    expect(events).toEqual(['submit', 'confirm']);
  });
});

describe('confirmation dialog compatibility', () => {
  it('ignores existing compose dialogs and excludes the clicked submit button', async () => {
    const submitButton = button({ label: 'Post' });
    const confirmButton = button({ label: 'Post without tags' });
    const composeDialog = {
      querySelector: vi.fn(() => null),
      querySelectorAll: vi.fn(() => [submitButton]),
    } as unknown as HTMLElement;
    const confirmDialog = {
      querySelector: vi.fn(() => null),
      querySelectorAll: vi.fn(() => [confirmButton]),
    } as unknown as HTMLElement;
    vi.stubGlobal('document', {
      body: {},
      querySelector: vi.fn(() => null),
      querySelectorAll: vi.fn((selector: string) => (
        selector === '[role="dialog"]' ? [composeDialog, confirmDialog] : []
      )),
    });
    vi.stubGlobal('MutationObserver', undefined);

    await expect(maybeConfirmDialog(['Post without tags'], 10, {
      ignoredDialogs: [composeDialog],
      excludedButtons: [submitButton],
    })).resolves.toBe(true);

    expect(confirmButton.click).toHaveBeenCalledOnce();
    expect(submitButton.click).not.toHaveBeenCalled();
  });
});
