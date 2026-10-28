/**
 * Tutti drives each SNS's desktop web UI in a dedicated, resizable posting
 * window. Mobile Chromium browsers (Kiwi, Edge, Lemur on Android, etc.) cannot
 * size windows and serve the SNS mobile sites, so posting is refused up front
 * instead of failing midway (tutti-issues#110).
 */
export function isMobileBrowser(
  nav: Pick<Navigator, 'userAgent'> & { userAgentData?: { mobile?: boolean } } = navigator,
): boolean {
  if (nav.userAgentData?.mobile === true) return true;
  return /Android|iPhone|iPad|iPod/i.test(nav.userAgent);
}
