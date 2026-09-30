export function getXThreadTextareas(
  scope: ParentNode,
  isVisible: (element: HTMLElement) => boolean,
): HTMLElement[] {
  return Array
    .from(scope.querySelectorAll<HTMLElement>('[data-testid^="tweetTextarea_"]'))
    .filter((element) => (
      /^tweetTextarea_\d+$/.test(element.getAttribute('data-testid') ?? '') &&
      (
        element.getAttribute('contenteditable') === 'true' ||
        element.getAttribute('role') === 'textbox'
      ) &&
      isVisible(element)
    ));
}

export function getXThreadTextarea(
  scope: ParentNode,
  index: number,
  isVisible: (element: HTMLElement) => boolean,
): HTMLElement | undefined {
  return getXThreadTextareas(scope, isVisible).find(
    (element) => element.getAttribute('data-testid') === `tweetTextarea_${index}`,
  );
}

export function getXComposeRoot(textarea: HTMLElement): HTMLElement {
  return textarea.closest<HTMLElement>('[role="dialog"]') ??
    textarea.closest<HTMLElement>('main') ??
    document.body;
}

/**
 * Draft.js renders each line as a separate `[data-block]` element. Joining
 * the blocks with a newline reproduces the source text exactly. textContent
 * drops the separators, and innerText renders an empty block (blank line) as
 * two newlines, so "A\n\nB" would read back as "A\n\n\nB" (tutti-issues#101).
 */
export function readXEditableText(element: HTMLElement | undefined): string {
  if (!element) return '';
  const blocks = element.querySelectorAll('[data-block="true"]');
  if (blocks.length > 0) {
    return Array.from(blocks, (block) => block.textContent ?? '').join('\n');
  }
  return element.innerText ?? element.textContent ?? '';
}

export function getXMediaComposeRoot(
  scope: ParentNode,
  isVisible: (element: HTMLElement) => boolean,
): HTMLElement | undefined {
  const visited = new Set<HTMLElement>();
  for (const textarea of getXThreadTextareas(scope, isVisible)) {
    const root = getXComposeRoot(textarea);
    if (visited.has(root)) continue;
    visited.add(root);
    if (hasXMediaAttachment(root, isVisible)) return root;
  }
  return undefined;
}

export function getLiveXMediaComposeRoot(
  scope: ParentNode,
  previousRoot: HTMLElement,
  isVisible: (element: HTMLElement) => boolean,
): HTMLElement | undefined {
  return getXMediaComposeRoot(scope, isVisible) ?? (
    previousRoot.isConnected && hasXMediaAttachment(previousRoot, isVisible)
      ? previousRoot
      : undefined
  );
}

export interface XThreadAddPostTarget {
  button: HTMLElement;
  textarea: HTMLElement;
}

/**
 * X can mirror text from the home inline composer into a compose dialog after
 * `/compose/post` has already become interactive. Resolve the Add post button
 * together with the textarea that owns it, and require that owner's first
 * chunk to match the draft. This avoids staying scoped to the disabled home
 * composer or clicking an unrelated visible draft dialog.
 * Each thread item can keep its own visible Add button. It inserts after that
 * item, so matching the dialog alone is not enough: require the previous
 * chunk's own toolbar, or a later add will insert an empty item mid-thread.
 */
export function getXThreadAddPostTarget(
  scope: ParentNode,
  expectedFirstChunk: string,
  isVisible: (element: HTMLElement) => boolean,
  isDisabled: (element: HTMLElement) => boolean,
  previousChunk: { index: number; text: string } = { index: 0, text: expectedFirstChunk },
): XThreadAddPostTarget | undefined {
  const expected = normalizeXComposeText(expectedFirstChunk);
  const candidates = Array.from(scope.querySelectorAll<HTMLElement>(
    '[data-testid="addButton"], button[aria-label], [role="button"][aria-label]',
  ));
  const ariaPatterns = [/add post/i, /ポストを追加/, /add tweet/i, /ツイートを追加/];

  for (const button of candidates) {
    if (!isVisible(button) || isDisabled(button)) continue;
    const aria = button.getAttribute('aria-label') ?? '';
    if (
      button.getAttribute('data-testid') !== 'addButton' &&
      !ariaPatterns.some((pattern) => pattern.test(aria))
    ) {
      continue;
    }

    const owner = button.closest<HTMLElement>('[role="dialog"]') ??
      button.closest<HTMLElement>('main') ??
      document.body;
    const firstTextarea = getXThreadTextarea(owner, 0, isVisible);
    if (!firstTextarea || normalizeXComposeText(readXEditableText(firstTextarea)) !== expected) continue;

    // The nearest ancestor containing an editor is the toolbar's thread item.
    // Do not guess when it contains multiple editors (e.g. the whole dialog).
    for (let item = button.parentElement; item; item = item.parentElement) {
      const editors = getXThreadTextareas(item, isVisible);
      if (editors.length > 0) {
        const textarea = editors[0]!;
        if (
          editors.length === 1 &&
          textarea.getAttribute('data-testid') === `tweetTextarea_${previousChunk.index}` &&
          normalizeXComposeText(readXEditableText(textarea)) === normalizeXComposeText(previousChunk.text)
        ) {
          return { button, textarea };
        }
        break;
      }
      if (item === owner) break;
    }
  }

  return undefined;
}

export function hasXMediaAttachment(
  scope: ParentNode,
  isVisible: (element: HTMLElement) => boolean,
): boolean {
  if (Array.from(scope.querySelectorAll<HTMLElement>('video')).some(isVisible)) {
    return true;
  }
  // X can replace the <video> preview while finalizing media in its compact
  // composer. The attachments container remains present only while the media
  // is still part of this draft, so it is stronger evidence than the transient
  // player element and still excludes a text-only composer.
  return Array.from(
    scope.querySelectorAll<HTMLElement>('[data-testid="attachments"]'),
  ).some(isVisible);
}

function normalizeXComposeText(value: string | null | undefined): string {
  return (value ?? '').replace(/\s+/g, ' ').trim();
}
