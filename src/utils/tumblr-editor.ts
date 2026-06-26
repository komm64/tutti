type QueryRoot = Document | DocumentFragment | Element;

export interface TumblrBodyBlockOptions {
  root?: QueryRoot;
  anchor?: Element | null;
}

const TUMBLR_EDITOR_SCOPE_SELECTOR = '[data-testid="gutenberg-editor"], [role="dialog"]';

const TUMBLR_BODY_CANDIDATE_SELECTOR = [
  '[data-testid="gutenberg-editor"] [contenteditable="true"]',
  '.block-editor-rich-text__editable[contenteditable="true"]',
  '[role="document"][contenteditable="true"]',
  'p[contenteditable="true"]',
  '[contenteditable="true"]',
].join(',');

const TUMBLR_NON_BODY_ANCESTOR_SELECTOR = [
  '[aria-label*="tag" i]',
  '[data-testid*="tag" i]',
  'button',
  '[role="button"]',
  'figure',
  '[data-block-type*="image" i]',
  '[data-type*="image" i]',
  '[data-testid*="media" i]',
].join(',');

const TUMBLR_NON_BODY_LABEL_RE =
  /\b(?:title|tag|tags|caption|alt|alt text|description)\b|タイトル|タグ|キャプション|説明|代替/i;

export function findTumblrBodyBlocks(
  selector: string,
  options: TumblrBodyBlockOptions = {},
): HTMLElement[] {
  const root = options.root ?? currentDocument();
  if (!root) return [];

  const firstSelectorMatch = querySelectorList(root, selector)[0] ?? null;
  const scope =
    connectedTumblrScope(options.anchor) ??
    connectedTumblrScope(firstSelectorMatch) ??
    querySelectorList(root, '[role="dialog"] [data-testid="gutenberg-editor"], [data-testid="gutenberg-editor"], [role="dialog"]')[0] ??
    root;

  const candidates = uniqueElements([
    ...querySelectorList(root, selector).filter((el) => containsNode(scope, el)),
    ...querySelectorList(scope, TUMBLR_BODY_CANDIDATE_SELECTOR),
  ]);

  return candidates.filter(isTumblrBodyBlock);
}

export function readTumblrBodyText(
  selector: string,
  options: TumblrBodyBlockOptions = {},
): string {
  return readTumblrBodyTextFromBlocks(findTumblrBodyBlocks(selector, options));
}

export function readTumblrBodyTextFromBlocks(blocks: readonly HTMLElement[]): string {
  return blocks
    .map((block) => (block.innerText ?? block.textContent ?? '').trim())
    .filter(Boolean)
    .join('\n');
}

export function isTumblrBodyBlock(el: HTMLElement): boolean {
  const contentEditable = (el.getAttribute('contenteditable') ?? '').toLowerCase();
  if (contentEditable !== 'true' && contentEditable !== 'plaintext-only') return false;
  if (['H1', 'INPUT', 'TEXTAREA', 'BUTTON'].includes(el.tagName)) return false;
  if (matchesClosest(el, TUMBLR_NON_BODY_ANCESTOR_SELECTOR)) return false;

  const labelText = [
    el.getAttribute('aria-label'),
    el.getAttribute('aria-placeholder'),
    el.getAttribute('data-placeholder'),
    el.getAttribute('placeholder'),
  ].filter(Boolean).join(' ');
  if (TUMBLR_NON_BODY_LABEL_RE.test(labelText)) return false;

  return true;
}

function currentDocument(): Document | null {
  return typeof document === 'undefined' ? null : document;
}

function connectedTumblrScope(anchor: Element | null | undefined): HTMLElement | null {
  if (!anchor || !('closest' in anchor)) return null;
  if ('isConnected' in anchor && anchor.isConnected === false) return null;
  return anchor.closest(TUMBLR_EDITOR_SCOPE_SELECTOR) as HTMLElement | null;
}

function querySelectorList(root: QueryRoot, selector: string): HTMLElement[] {
  const matches: HTMLElement[] = [];
  for (const part of selector.split(',').map((s) => s.trim()).filter(Boolean)) {
    try {
      matches.push(...Array.from(root.querySelectorAll<HTMLElement>(part)));
    } catch {
      // Ignore one broken fallback selector without hiding matches from other parts.
    }
  }
  return matches;
}

function containsNode(scope: QueryRoot, el: HTMLElement): boolean {
  if (scope === el) return true;
  return typeof scope.contains === 'function' ? scope.contains(el) : true;
}

function matchesClosest(el: HTMLElement, selector: string): boolean {
  try {
    return !!el.closest(selector);
  } catch {
    return false;
  }
}

function uniqueElements(elements: HTMLElement[]): HTMLElement[] {
  const seen = new Set<HTMLElement>();
  const unique: HTMLElement[] = [];
  for (const el of elements) {
    if (seen.has(el)) continue;
    seen.add(el);
    unique.push(el);
  }
  return unique;
}
