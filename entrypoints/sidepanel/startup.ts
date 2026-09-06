import { log } from '../../src/utils/logger';

interface SidepanelStartupOptions<T> {
  target: HTMLElement;
  initialize: () => Promise<void>;
  mount: () => T;
  slowThresholdMs?: number;
}

/** Keep the static Loading shell visible until localization is actually ready. */
export async function bootstrapSidepanel<T>(
  options: SidepanelStartupOptions<T>,
): Promise<T> {
  const startedAt = Date.now();
  const slowThresholdMs = options.slowThresholdMs ?? 1_000;
  const slowWarning = setTimeout(() => {
    log.warn(`Sidepanel: localization is still loading after ${slowThresholdMs}ms`);
  }, slowThresholdMs);

  try {
    await options.initialize();
    log.info(`Sidepanel: localization loaded in ${Date.now() - startedAt}ms`);
  } catch (error) {
    log.error('Sidepanel: localization initialization failed; using browser defaults', error);
  } finally {
    clearTimeout(slowWarning);
  }

  options.target.replaceChildren();
  options.target.removeAttribute('aria-busy');
  return options.mount();
}
