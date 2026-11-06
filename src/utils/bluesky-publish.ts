/**
 * True when the composer's Publish button is shown and enabled again. Bluesky
 * removes it while it uploads media after Publish, so an open composer with an
 * idle Publish button is waiting for the user rather than still working.
 */
export function isBlueskyPublishIdle(postButtonSelector: string, root: ParentNode = document): boolean {
  return Array.from(root.querySelectorAll<HTMLElement>(postButtonSelector)).some((el) => (
    !(el as HTMLButtonElement).disabled && el.getAttribute('aria-disabled') !== 'true'
  ));
}
