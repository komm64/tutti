export class OperationTimeoutError extends Error {
  constructor(
    readonly label: string,
    readonly timeoutMs: number,
  ) {
    super(`${label} timed out after ${timeoutMs}ms`);
    this.name = 'OperationTimeoutError';
  }
}

/**
 * Bounds work that cannot be cancelled directly (for example extension message
 * ports). Callers that own an AbortController should still abort the underlying
 * operation from `onTimeout` so it does not continue consuming resources.
 */
export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string,
  onTimeout?: () => void,
): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  return new Promise<T>((resolve, reject) => {
    timeout = setTimeout(() => {
      onTimeout?.();
      reject(new OperationTimeoutError(label, timeoutMs));
    }, timeoutMs);

    promise.then(resolve, reject).finally(() => {
      if (timeout) clearTimeout(timeout);
    });
  });
}
