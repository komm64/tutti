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
