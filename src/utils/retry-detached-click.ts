/**
 * Retry once when the page-world click bridge reports that its marked target
 * disappeared. The callback must reacquire the live element on every call.
 *
 * This is only suitable for reversible UI actions such as opening a composer;
 * irreversible submit actions must not use it.
 */
export async function retryDetachedClick<T>(
  clickFreshTarget: () => Promise<T>,
  beforeRetry: () => Promise<void> = async () => undefined,
): Promise<T> {
  try {
    return await clickFreshTarget();
  } catch (error) {
    if (!(error instanceof Error) || error.message !== 'click target not found') {
      throw error;
    }
    await beforeRetry();
    return clickFreshTarget();
  }
}
