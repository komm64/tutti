export type TextEditorDriverKind =
  | 'native'
  | 'lexical'
  | 'draft'
  | 'contenteditable';

interface ContentEditableDriverOptions {
  sleep?: (ms: number) => Promise<void>;
  waitFor?: (predicate: () => boolean, timeoutMs: number) => Promise<boolean>;
}

export function resolveTextEditorDriver(element: HTMLElement): TextEditorDriverKind {
  if (element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement) {
    return 'native';
  }
  if (
    element.matches('.public-DraftEditor-content') ||
    !!element.closest('.DraftEditor-root')
  ) {
    return 'draft';
  }
  if (
    element.matches('[data-lexical-editor]') ||
    !!element.closest('[data-lexical-editor]') ||
    (
      element.getAttribute('contenteditable') === 'true' &&
      /^tweetTextarea_\d+$/.test(element.getAttribute('data-testid') ?? '')
    )
  ) {
    return 'lexical';
  }
  return 'contenteditable';
}

export function shouldUseDirectLexicalState(
  hostname: string,
  element: HTMLElement,
): boolean {
  const host = hostname.toLowerCase();
  if (/(?:^|\.)instagram\.com$/.test(host)) return true;
  if (/(?:^|\.)threads\.(?:com|net)$/.test(host)) return true;
  // X's current composer does not expose a stable Lexical editor instance.
  // Direct DOM/editor-state mutation can leave tweet_text empty even while the
  // rendered textarea contains the expected caption. Use X's paste handler for
  // every exact tweetTextarea_n editor so its submit state owns the text.
  return false;
}

export function shouldUseXEditorPaste(
  hostname: string,
  element: HTMLElement,
): boolean {
  if (!/(?:^|\.)x\.com$/.test(hostname.toLowerCase())) return false;
  const testId = element.getAttribute('data-testid') ?? '';
  return /^tweetTextarea_\d+$/.test(testId);
}

export function injectNativeText(
  element: HTMLInputElement | HTMLTextAreaElement,
  text: string,
): void {
  const prototype = element instanceof HTMLTextAreaElement
    ? HTMLTextAreaElement.prototype
    : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
  if (setter) setter.call(element, text);
  else element.value = text;
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
}

export async function injectContentEditableText(
  element: HTMLElement,
  text: string,
  options: ContentEditableDriverOptions = {},
): Promise<void> {
  const existing = (element.textContent ?? '').trim();
  if (existing.length > 0) {
    const selection = window.getSelection();
    if (selection) {
      selection.selectAllChildren(element);
      selection.deleteFromDocument();
    }
    if ((element.textContent ?? '').trim().length > 0) {
      try {
        document.execCommand('selectAll', false);
        document.execCommand('delete', false);
      } catch { /* ignore */ }
    }
  }

  const dataTransfer = new DataTransfer();
  dataTransfer.setData('text/plain', text);
  element.dispatchEvent(new ClipboardEvent('paste', {
    bubbles: true,
    cancelable: true,
    clipboardData: dataTransfer,
  }));

  const matchSnippet = text.slice(0, Math.min(16, text.length));
  const visibleNow = (): string => element.innerText ?? element.textContent ?? '';
  const waitFor = options.waitFor ?? defaultWaitFor;
  const pasted = await waitFor(
    () => matchSnippet === '' || visibleNow().includes(matchSnippet),
    600,
  );
  if (pasted) return;

  element.textContent = text;
  element.dispatchEvent(new InputEvent('input', {
    bubbles: true,
    data: text,
    inputType: 'insertText',
  }));
  await (options.sleep ?? defaultSleep)(80);
}

async function defaultSleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function defaultWaitFor(predicate: () => boolean, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await defaultSleep(50);
  }
  return false;
}
