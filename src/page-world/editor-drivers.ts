export type TextEditorDriverKind =
  | 'native'
  | 'lexical'
  | 'draft'
  | 'contenteditable';

interface ContentEditableDriverOptions {
  sleep?: (ms: number) => Promise<void>;
  waitFor?: (predicate: () => boolean, timeoutMs: number) => Promise<boolean>;
}

interface XDraftDriverOptions {
  resolveCurrent?: () => HTMLElement | undefined;
  waitFor?: (predicate: () => boolean, timeoutMs: number) => Promise<boolean>;
  sleep?: (ms: number) => Promise<void>;
  insertText?: (element: HTMLElement, text: string) => boolean;
  maxAttempts?: number;
}

export interface XDraftTextSegment {
  kind: 'paste' | 'type';
  text: string;
}

export function resolveTextEditorDriver(element: HTMLElement): TextEditorDriverKind {
  if (element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement) {
    return 'native';
  }
  // X currently renders Draft.js markup (`public-DraftEditor-content`) while
  // also using the stable tweetTextarea_N contract. It needs the X-specific
  // remount-safe path below, so classify the exact editor before the generic
  // Draft.js branch.
  if (
    element.getAttribute('contenteditable') === 'true' &&
    /^tweetTextarea_\d+$/.test(element.getAttribute('data-testid') ?? '')
  ) {
    return 'lexical';
  }
  if (
    element.matches('.public-DraftEditor-content') ||
    !!element.closest('.DraftEditor-root')
  ) {
    return 'draft';
  }
  if (
    element.matches('[data-lexical-editor]') ||
    !!element.closest('[data-lexical-editor]')
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

export function splitXDraftTextSegments(text: string): XDraftTextSegment[] {
  const segments: XDraftTextSegment[] = [];
  let offset = 0;
  for (const match of text.matchAll(/[#@]\S+/gu)) {
    const index = match.index ?? 0;
    if (index > offset) {
      segments.push({ kind: 'paste', text: text.slice(offset, index) });
    }
    segments.push({ kind: 'type', text: match[0] });
    offset = index + match[0].length;
  }
  if (offset < text.length) {
    segments.push({ kind: 'paste', text: text.slice(offset) });
  }
  return segments.length > 0 ? segments : [{ kind: 'paste', text }];
}

/**
 * X currently remounts its Draft.js editor when a pasted hashtag/mention is
 * decorated. The successful text remains on the detached node while the live
 * editor loses the entity. Paste ordinary spans, then enter entity spans one
 * character at a time and retry only a character lost during that remount.
 */
export async function injectXDraftText(
  initialElement: HTMLElement,
  text: string,
  options: XDraftDriverOptions = {},
): Promise<HTMLElement> {
  const resolveCurrent = options.resolveCurrent ?? (() => (
    initialElement.isConnected ? initialElement : undefined
  ));
  const waitFor = options.waitFor ?? defaultWaitFor;
  const sleep = options.sleep ?? defaultSleep;
  const insertText = options.insertText ?? ((element, value) => {
    element.focus();
    placeCaretAtEnd(element);
    try {
      return document.execCommand('insertText', false, value);
    } catch {
      return false;
    }
  });
  const maxAttempts = options.maxAttempts ?? 3;
  const expectedText = normalizeXDraftText(text);
  let current = resolveCurrent() ?? initialElement;
  const existing = normalizeXDraftText(readContentEditableText(current));
  if (existing === expectedText) return current;
  if (existing !== '') {
    throw new Error('X Draft editor must be empty before segmented injection');
  }

  let expected = '';
  for (const segment of splitXDraftTextSegments(text)) {
    if (segment.kind === 'paste') {
      const before = normalizeXDraftText(expected);
      expected += segment.text;
      current = await appendXDraftPiece({
        piece: segment.text,
        before,
        after: normalizeXDraftText(expected),
        mode: 'paste',
        resolveCurrent,
        waitFor,
        sleep,
        insertText,
        maxAttempts,
      });
      continue;
    }

    for (const character of Array.from(segment.text)) {
      const before = normalizeXDraftText(expected);
      expected += character;
      current = await appendXDraftPiece({
        piece: character,
        before,
        after: normalizeXDraftText(expected),
        mode: 'type',
        resolveCurrent,
        waitFor,
        sleep,
        insertText,
        maxAttempts,
      });
    }
  }

  if (normalizeXDraftText(readContentEditableText(current)) !== expectedText) {
    throw new Error('X Draft editor did not retain the complete text');
  }
  return current;
}

async function appendXDraftPiece(options: {
  piece: string;
  before: string;
  after: string;
  mode: 'paste' | 'type';
  resolveCurrent: () => HTMLElement | undefined;
  waitFor: (predicate: () => boolean, timeoutMs: number) => Promise<boolean>;
  sleep: (ms: number) => Promise<void>;
  insertText: (element: HTMLElement, text: string) => boolean;
  maxAttempts: number;
}): Promise<HTMLElement> {
  for (let attempt = 1; attempt <= options.maxAttempts; attempt += 1) {
    const current = options.resolveCurrent();
    if (!current) throw new Error('X Draft editor disappeared during injection');
    const currentText = normalizeXDraftText(readContentEditableText(current));
    if (currentText === options.after) return current;
    if (currentText !== options.before) {
      throw new Error(
        `X Draft editor changed unexpectedly (expected ${JSON.stringify(options.before)}, ` +
        `got ${JSON.stringify(currentText)})`,
      );
    }

    if (options.mode === 'paste') {
      current.focus();
      placeCaretAtEnd(current);
      const dataTransfer = new DataTransfer();
      dataTransfer.setData('text/plain', options.piece);
      current.dispatchEvent(new ClipboardEvent('paste', {
        bubbles: true,
        cancelable: true,
        clipboardData: dataTransfer,
      }));
    } else if (!options.insertText(current, options.piece)) {
      throw new Error('X Draft editor rejected synthetic character input');
    }

    // Native execCommand/paste mutates the raw DOM synchronously, but X's
    // React/Draft commit can replace that editor a moment later. Never accept
    // the transient raw match as success; verify the live node after commit.
    // Later inline-thread editors take longer to commit pasted text than the
    // first composer. Starting entity decoration before that commit completes
    // can make X rebuild the thread from stale Draft state and duplicate the
    // complete final chunk. Keep the paste idle for the Surface-observed 1s
    // commit window before entering a hashtag or mention.
    await options.sleep(options.mode === 'paste' ? 1_200 : 350);

    const retained = await options.waitFor(
      () => {
        const live = options.resolveCurrent();
        return !!live && normalizeXDraftText(readContentEditableText(live)) === options.after;
      },
      options.mode === 'paste' ? 1_000 : 500,
    );
    if (retained) return options.resolveCurrent()!;
  }
  throw new Error(
    `X Draft editor did not retain ${JSON.stringify(options.piece)} after ` +
    `${options.maxAttempts} attempts`,
  );
}

function placeCaretAtEnd(element: HTMLElement): void {
  const selection = window.getSelection();
  if (!selection) return;
  const range = document.createRange();
  range.selectNodeContents(element);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
}

function readContentEditableText(element: HTMLElement): string {
  return element.innerText ?? element.textContent ?? '';
}

function normalizeXDraftText(value: string): string {
  return value.replace(/\r\n/gu, '\n').replace(/\u200b/gu, '').trim();
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
