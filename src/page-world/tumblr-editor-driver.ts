import {
  findTumblrBodyBlocks,
  readTumblrBodyTextFromBlocks,
} from '../utils/tumblr-editor';
import { validateTumblrBodyText } from '../utils/tumblr-text';
import { extractHttpUrls, mergeStandaloneUrlParagraphs } from '../utils/text-urls';
import { findElementBySelectorList } from './element-commands';

export interface TumblrTextCommandRequest {
  id: string;
  selector: string;
  text?: string;
}

export interface TumblrTextCommandResponse<Source extends string> {
  source: Source;
  id: string;
  ok: boolean;
  error?: string;
}

export async function handleTumblrTextCommand<Source extends string>(
  request: TumblrTextCommandRequest,
  source: Source,
): Promise<TumblrTextCommandResponse<Source>> {
  const found = findElementBySelectorList(request.selector);
  if (!found) {
    return { source, id: request.id, ok: false, error: 'Tumblr text target not found' };
  }
  const originalText = request.text ?? '';
  const text = mergeStandaloneUrlParagraphs(originalText);
  const expectedUrls = extractHttpUrls(originalText);
  const blocks = findTumblrBodyBlocks(request.selector, { anchor: found.el });
  const target = blocks[0] ?? found.el;
  console.log(
    `[Tutti inject-helper] Tumblr text target matched ` +
    `"${found.matchedPart}" (${blocks.length} body blocks)`,
  );

  for (const block of blocks) {
    await clearEditableBlock(block);
  }
  target.focus();

  if (text) {
    const dataTransfer = new DataTransfer();
    dataTransfer.setData('text/plain', text);
    target.dispatchEvent(new ClipboardEvent('paste', {
      bubbles: true,
      cancelable: true,
      clipboardData: dataTransfer,
    }));
    const expectedSnippet = text.slice(0, Math.min(20, text.length)).trim();
    const pasted = await waitFor(
      () => readTumblrBodyTextFromBlocks(
        findTumblrBodyBlocks(request.selector, { anchor: target }),
      ).includes(expectedSnippet),
      700,
    );
    if (!pasted) {
      target.textContent = text;
      target.dispatchEvent(new InputEvent('input', {
        bubbles: true,
        data: text,
        inputType: 'insertText',
      }));
      await sleep(100);
    }
  }

  let afterBlocks = findTumblrBodyBlocks(request.selector, { anchor: target });
  let bodyText = readTumblrBodyTextFromBlocks(afterBlocks);
  let validation = validateTumblrBodyText(bodyText, text, {
    allowHashtagStripped: true,
  });
  if (!validation.ok && expectedUrls.length > 0) {
    console.warn(
      `[Tutti inject-helper] Tumblr paste validation failed with URL text; ` +
      `retrying plain insert (${validation.error ?? 'unknown'})`,
    );
    await insertTumblrPlainText(request.selector, target, text);
    afterBlocks = findTumblrBodyBlocks(request.selector, { anchor: target });
    bodyText = readTumblrBodyTextFromBlocks(afterBlocks);
    validation = validateTumblrBodyText(bodyText, text, {
      allowHashtagStripped: true,
    });
  }
  return {
    source,
    id: request.id,
    ok: validation.ok,
    error: validation.error,
  };
}

async function clearEditableBlock(element: HTMLElement): Promise<void> {
  element.focus();
  const selection = window.getSelection();
  if (selection) {
    try {
      selection.removeAllRanges();
      const range = document.createRange();
      range.selectNodeContents(element);
      selection.addRange(range);
    } catch { /* ignore */ }
  }
  try {
    document.execCommand('delete', false);
  } catch { /* fallback below */ }
  if ((element.textContent ?? '').trim().length > 0) {
    element.textContent = '';
    element.dispatchEvent(new InputEvent('input', {
      bubbles: true,
      inputType: 'deleteContentBackward',
    }));
  }
  await sleep(50);
}

async function insertTumblrPlainText(
  selector: string,
  anchor: HTMLElement,
  text: string,
): Promise<void> {
  const blocks = findTumblrBodyBlocks(selector, { anchor });
  for (const block of blocks) {
    await clearEditableBlock(block);
  }
  const target = blocks[0] ?? anchor;
  target.focus();
  const selection = window.getSelection();
  if (selection) {
    try {
      selection.removeAllRanges();
      const range = document.createRange();
      range.selectNodeContents(target);
      selection.addRange(range);
    } catch { /* ignore */ }
  }
  target.dispatchEvent(new InputEvent('beforeinput', {
    bubbles: true,
    cancelable: true,
    inputType: 'insertText',
    data: text,
  }));
  let inserted = false;
  try {
    inserted = document.execCommand('insertText', false, text);
  } catch { /* fallback below */ }
  const expectedSnippet = text.slice(0, Math.min(20, text.length)).trim();
  const visible = () => readTumblrBodyTextFromBlocks(
    findTumblrBodyBlocks(selector, { anchor: target }),
  );
  if (!inserted || (expectedSnippet && !visible().includes(expectedSnippet))) {
    target.textContent = text;
  }
  target.dispatchEvent(new InputEvent('input', {
    bubbles: true,
    data: text,
    inputType: 'insertText',
  }));
  target.dispatchEvent(new KeyboardEvent('keyup', {
    bubbles: true,
    key: text.slice(-1) || 'a',
  }));
  await sleep(250);
}

async function waitFor(predicate: () => boolean, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await sleep(50);
  }
  return false;
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}
