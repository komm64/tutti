import {
  elementTextMatches,
  findClickableByText,
  sleep,
  waitForCondition,
} from './dom';
import {
  markPostStepCompleted,
  markPostStepFailed,
  markPostStepStarted,
  markPostSubmissionStarted,
} from './post-submission-state';
import { clickElementWithPacing } from './web-action-pacing';

const CONFIRM_DIALOG_SELECTORS = [
  '[role="dialog"]',
  '[role="alertdialog"]',
  '.modal-root__container',
  '.components-modal__frame',
  'ytcp-dialog',
  'tp-yt-paper-dialog',
];

export interface FlowButtonSpec {
  selector?: string;
  texts?: string[];
  finder?: () => HTMLElement | null;
}

export interface FindFlowButtonOptions {
  preferEnabledSelectorMatch?: boolean;
}

export interface WaitForSubmitButtonOptions extends FindFlowButtonOptions {
  allowDisabled?: boolean;
  intervalMs?: number;
}

export interface SubmitButtonResolution {
  button: HTMLElement | null;
  lastFound: HTMLElement | null;
}

export interface ConfirmDialogOptions {
  ignoredDialogs?: readonly HTMLElement[];
  excludedButtons?: readonly HTMLElement[];
  composeInputSelector?: string;
}

export interface FinalizeFlowOptions {
  button: HTMLElement;
  click?: () => Promise<void> | void;
  confirmDialogButtonTexts?: string[];
  confirmDialogGraceMs?: number;
  confirmDialogOptions?: ConfirmDialogOptions;
  afterClickDelayMs?: number;
}

export function isFlowButtonDisabled(button: HTMLElement): boolean {
  return button.getAttribute('aria-disabled') === 'true' ||
    (button as HTMLButtonElement).disabled;
}

export function findFlowButton(
  spec: FlowButtonSpec,
  options: FindFlowButtonOptions = {},
): HTMLElement | null {
  if (spec.finder) return spec.finder();
  if (spec.selector) {
    let firstSelectorMatch: HTMLElement | null = null;
    for (const part of splitSelectorList(spec.selector)) {
      const matches = options.preferEnabledSelectorMatch
        ? document.querySelectorAll<HTMLElement>(part)
        : [document.querySelector<HTMLElement>(part)].filter(
          (element): element is HTMLElement => element !== null,
        );
      for (const element of matches) {
        firstSelectorMatch ??= element;
        if (
          !options.preferEnabledSelectorMatch ||
          !isFlowButtonDisabled(element)
        ) {
          return element;
        }
      }
    }
    if (firstSelectorMatch) return firstSelectorMatch;
  }
  if (spec.texts && spec.texts.length > 0) {
    return findClickableByText(spec.texts);
  }
  return null;
}

export async function waitForSubmitButton(
  spec: FlowButtonSpec,
  timeoutMs: number,
  options: WaitForSubmitButtonOptions = {},
): Promise<SubmitButtonResolution> {
  markPostStepStarted('wait-submit');
  let lastFound: HTMLElement | null = null;
  const button = await waitForCondition<HTMLElement>(() => {
    const candidate = findFlowButton(spec, options);
    if (!candidate) return null;
    lastFound = candidate;
    if (!isFlowButtonDisabled(candidate) || options.allowDisabled) {
      return candidate;
    }
    return null;
  }, {
    timeoutMs,
    intervalMs: options.intervalMs ?? 150,
  });
  if (button) {
    markPostStepCompleted('wait-submit');
  } else {
    markPostStepFailed('wait-submit');
  }
  return { button, lastFound };
}

export function highlightPreviewButton(button: HTMLElement, message: string): void {
  console.log(message, button);
  const originalOutline = button.style.outline;
  button.style.outline = '3px dashed #f59e0b';
  setTimeout(() => {
    button.style.outline = originalOutline;
  }, 5000);
}

export async function finalizeFlow(options: FinalizeFlowOptions): Promise<void> {
  markPostSubmissionStarted();
  if (options.click) {
    await options.click();
  } else {
    options.button.click();
  }

  if (
    options.confirmDialogButtonTexts &&
    options.confirmDialogButtonTexts.length > 0
  ) {
    markPostStepStarted('complete-confirmation');
    await maybeConfirmDialog(
      options.confirmDialogButtonTexts,
      options.confirmDialogGraceMs,
      options.confirmDialogOptions,
    );
    markPostStepCompleted('complete-confirmation');
  }

  markPostStepStarted('post-processing');
  await sleep(options.afterClickDelayMs ?? 250);
  markPostStepCompleted('post-processing');
}

export async function maybeConfirmDialog(
  texts: string[],
  graceMs = 800,
  options: ConfirmDialogOptions = {},
): Promise<boolean> {
  const start = Date.now();
  const ignoredDialogs = new Set(options.ignoredDialogs ?? []);
  const excludedButtons = new Set(options.excludedButtons ?? []);
  let lastSeenDialog: HTMLElement | null = null;
  let lastSeenButtonTexts: string[] = [];
  const resolution = await waitForCondition<HTMLElement | true>(() => {
    for (const dialog of collectConfirmDialogs()) {
      if (ignoredDialogs.has(dialog)) continue;
      if (
        options.composeInputSelector &&
        dialog.querySelector(options.composeInputSelector)
      ) {
        continue;
      }
      lastSeenDialog = dialog;
      const buttons = Array.from(
        dialog.querySelectorAll<HTMLButtonElement>(
          'button, ytcp-button[role="button"], [role="button"]',
        ),
      ).filter((button) => !excludedButtons.has(button));
      lastSeenButtonTexts = buttons
        .map((button) => (button.textContent ?? '').trim())
        .filter((text) => text.length > 0);
      for (const wanted of texts) {
        const target = buttons.find((button) => elementTextMatches(button, [wanted]));
        if (target && !target.disabled) {
          console.log(`[Tutti] confirm dialog: preparing "${wanted}"`);
          return target;
        }
      }
    }
    if (!lastSeenDialog && Date.now() - start >= graceMs) return true;
    return null;
  }, { timeoutMs: 8000, intervalMs: 150 });

  if (resolution && resolution !== true) {
    await clickElementWithPacing(resolution);
  }

  if (lastSeenDialog && lastSeenButtonTexts.length > 0) {
    console.warn(
      `[Tutti] confirm dialog detected but no button matched. ` +
      `Tried: [${texts.join(', ')}]. ` +
      `Saw: [${lastSeenButtonTexts.join(', ')}]`,
    );
  }
  return resolution !== null;
}

export function collectConfirmDialogs(): HTMLElement[] {
  const dialogs: HTMLElement[] = [];
  for (const selector of CONFIRM_DIALOG_SELECTORS) {
    dialogs.push(...Array.from(document.querySelectorAll<HTMLElement>(selector)));
  }
  return dialogs.filter((dialog, index, all) => all.indexOf(dialog) === index);
}

function splitSelectorList(selector: string): string[] {
  return selector.split(',').map((part) => part.trim()).filter(Boolean);
}
