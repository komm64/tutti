export interface ElementCommandRequest {
  id: string;
  selector: string;
  tags?: string[];
  texts?: string[];
}

export interface ElementCommandResponse<Source extends string> {
  source: Source;
  id: string;
  ok: boolean;
  error?: string;
}

interface FindElementOptions {
  root?: ParentNode;
  preferVisible?: boolean;
  isVisible?: (element: HTMLElement) => boolean;
}

interface TagListCommandOptions {
  root?: ParentNode;
  sleep?: (ms: number) => Promise<void>;
  waitFor?: (predicate: () => boolean, timeoutMs: number) => Promise<boolean>;
}

interface ClickCommandOptions {
  root?: ParentNode;
  hostname?: string;
}

export function findElementBySelectorList(
  selector: string,
  options: FindElementOptions = {},
): { el: HTMLElement; matchedPart: string } | null {
  const root = options.root ?? document;
  let fallback: { el: HTMLElement; matchedPart: string } | null = null;
  for (const part of selector.split(',').map((value) => value.trim()).filter(Boolean)) {
    const elements = Array.from(root.querySelectorAll<HTMLElement>(part));
    if (!fallback && elements[0]) fallback = { el: elements[0], matchedPart: part };
    if (options.preferVisible) {
      const visible = elements.find(options.isVisible ?? isVisibleElement);
      if (visible) return { el: visible, matchedPart: part };
    } else if (elements[0]) {
      return { el: elements[0], matchedPart: part };
    }
  }
  return fallback;
}

export async function handleTagListCommand<Source extends string>(
  request: ElementCommandRequest,
  source: Source,
  options: TagListCommandOptions = {},
): Promise<ElementCommandResponse<Source>> {
  const found = findElementBySelectorList(request.selector, { root: options.root });
  if (!found) {
    return {
      source,
      id: request.id,
      ok: false,
      error: `tag input not found: ${request.selector}`,
    };
  }
  const input = found.el as HTMLInputElement | HTMLTextAreaElement;
  const isTextarea = input instanceof HTMLTextAreaElement;
  if (!(input instanceof HTMLInputElement) && !isTextarea) {
    return {
      source,
      id: request.id,
      ok: false,
      error: 'tag-list mode only supports <input> and <textarea> elements',
    };
  }

  const tags = request.tags ?? [];
  console.log(
    `[Tutti inject-helper] tag-list: ${tags.length} tags into ` +
    `"${found.matchedPart}" (${isTextarea ? 'textarea' : 'input'})`,
  );
  const setter = isTextarea
    ? Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
    : Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  const sleep = options.sleep ?? defaultSleep;
  const waitFor = options.waitFor ?? defaultWaitFor;

  function setReactValue(element: HTMLInputElement | HTMLTextAreaElement, value: string): void {
    const tracker = (element as HTMLInputElement & {
      _valueTracker?: { setValue: (nextValue: string) => void };
    })._valueTracker;
    if (tracker) tracker.setValue('');
    if (setter) setter.call(element, value);
    else element.value = value;
  }

  let committed = 0;
  for (const tag of tags) {
    input.focus();
    setReactValue(input, tag);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await sleep(150);

    const eventInit = {
      key: 'Enter',
      code: 'Enter',
      keyCode: 13,
      which: 13,
      bubbles: true,
      cancelable: true,
    };
    input.dispatchEvent(new KeyboardEvent('keydown', eventInit));
    input.dispatchEvent(new KeyboardEvent('keypress', eventInit));
    input.dispatchEvent(new KeyboardEvent('keyup', eventInit));
    const cleared = await waitFor(() => input.value === '', 1500);
    if (cleared) {
      committed += 1;
      console.log(`[Tutti inject-helper] tag committed: "${tag}"`);
      continue;
    }

    console.warn(
      `[Tutti inject-helper] tag NOT committed (input not cleared): ` +
      `"${tag}" current="${input.value}"`,
    );
    input.dispatchEvent(new KeyboardEvent('keydown', eventInit));
    await sleep(400);
    if (input.value === '') {
      committed += 1;
      console.log(`[Tutti inject-helper] tag committed on retry: "${tag}"`);
    }
  }

  return {
    source,
    id: request.id,
    ok: committed > 0,
    error: committed === 0 ? `no tags committed (tried ${tags.length})` : undefined,
  };
}

export async function handleClickCommand<Source extends string>(
  request: ElementCommandRequest,
  source: Source,
  options: ClickCommandOptions = {},
): Promise<ElementCommandResponse<Source>> {
  const root = options.root ?? document;
  const hostname = options.hostname ?? location.hostname;
  const texts = request.texts ?? [];
  for (const part of request.selector.split(',').map((value) => value.trim()).filter(Boolean)) {
    for (const element of root.querySelectorAll<HTMLElement>(part)) {
      if (texts.length > 0 && !clickTextMatches(element, texts)) continue;
      if (
        element.getAttribute('aria-disabled') === 'true' ||
        (element as HTMLButtonElement).disabled
      ) continue;
      console.log(`[Tutti inject-helper] click target matched "${part}"`);
      if (
        /^(x|twitter)\.com$/.test(hostname) &&
        (
          element.getAttribute('data-testid') === 'addButton' ||
          /add post/i.test(element.getAttribute('aria-label') ?? '')
        )
      ) {
        element.focus();
        const eventInit = {
          bubbles: true,
          cancelable: true,
          composed: true,
          key: 'Enter',
          code: 'Enter',
        };
        element.dispatchEvent(new KeyboardEvent('keydown', eventInit));
        element.dispatchEvent(new KeyboardEvent('keypress', eventInit));
        element.dispatchEvent(new KeyboardEvent('keyup', eventInit));
        return { source, id: request.id, ok: true };
      }
      element.click();
      return { source, id: request.id, ok: true };
    }
  }
  return { source, id: request.id, ok: false, error: 'click target not found' };
}

function clickTextMatches(element: HTMLElement, texts: string[]): boolean {
  const values = [
    element.textContent,
    element.getAttribute('aria-label'),
    element.getAttribute('title'),
  ].map((value) => (value ?? '').replace(/\s+/g, ' ').trim());
  return values.some((value) => value && texts.includes(value));
}

function isVisibleElement(element: HTMLElement): boolean {
  return element.getClientRects().length > 0;
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
