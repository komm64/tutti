export const ACTIVE_OPERATION_KEEPALIVE_INTERVAL_MS = 20_000;

export interface ServiceWorkerKeepAliveOptions {
  intervalMs?: number;
  touch?: () => Promise<unknown>;
}

/**
 * Keeps the MV3 service worker alive only while one user-initiated operation
 * is active. Chrome resets its worker lifetime timers when an extension API is
 * called; the interval stays below the normal 30-second idle ceiling.
 */
export async function withServiceWorkerKeepAlive<T>(
  operation: () => Promise<T>,
  options: ServiceWorkerKeepAliveOptions = {},
): Promise<T> {
  const intervalMs = options.intervalMs ?? ACTIVE_OPERATION_KEEPALIVE_INTERVAL_MS;
  const touch = options.touch ?? (() => browser.runtime.getPlatformInfo());
  let touchInFlight = false;

  const touchWorker = (): void => {
    if (touchInFlight) return;
    touchInFlight = true;
    void Promise.resolve()
      .then(touch)
      .catch(() => { /* the active operation owns user-facing failures */ })
      .finally(() => {
        touchInFlight = false;
      });
  };

  touchWorker();
  const timer = setInterval(touchWorker, intervalMs);
  try {
    return await operation();
  } finally {
    clearInterval(timer);
  }
}
