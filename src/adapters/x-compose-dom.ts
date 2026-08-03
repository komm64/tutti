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
 * Draft.js renders each paragraph in a separate block. textContent joins
 * those blocks without separators, which makes a correct URL-prefilled draft
 * look different from the original text. innerText preserves the rendered
 * line boundaries used by X's composer.
 */
export function readXEditableText(element: HTMLElement | undefined): string {
  return element?.innerText ?? element?.textContent ?? '';
}

export function getXVideoComposeRoot(
  scope: ParentNode,
  isVisible: (element: HTMLElement) => boolean,
): HTMLElement | undefined {
  const visited = new Set<HTMLElement>();
  for (const textarea of getXThreadTextareas(scope, isVisible)) {
    const root = getXComposeRoot(textarea);
    if (visited.has(root)) continue;
    visited.add(root);
    if (hasXVideoAttachment(root, isVisible)) return root;
  }
  return undefined;
}

export function getLiveXVideoComposeRoot(
  scope: ParentNode,
  previousRoot: HTMLElement,
  isVisible: (element: HTMLElement) => boolean,
): HTMLElement | undefined {
  return getXVideoComposeRoot(scope, isVisible) ?? (
    previousRoot.isConnected && hasXVideoAttachment(previousRoot, isVisible)
      ? previousRoot
      : undefined
  );
}

export function hasXVideoAttachment(
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
