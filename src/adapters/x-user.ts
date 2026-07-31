const X_HANDLE_RE = /^[A-Za-z0-9_]{1,15}$/;

/**
 * X hides its side navigation in the compact request-scoped posting window.
 * Prefer the handle visible in the compose document, then use the account that
 * background captured before dispatching the request. Invalid stored values
 * are ignored before they reach URL selectors or regular expressions.
 */
export function resolveXOwnHandle(
  detectedUser: string | null | undefined,
  expectedUser: string | null | undefined,
): string | undefined {
  for (const candidate of [detectedUser, expectedUser]) {
    const handle = candidate?.trim().replace(/^@/, '');
    if (handle && X_HANDLE_RE.test(handle)) return handle;
  }
  return undefined;
}
