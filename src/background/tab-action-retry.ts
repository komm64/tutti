import { log } from '../utils/logger';

const DEFAULT_ATTEMPTS = 6;
const DEFAULT_BASE_DELAY_MS = 250;

export interface RetryTransientTabActionOptions {
  attempts?: number;
  baseDelayMs?: number;
}

export function isTransientTabActionError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /Tabs cannot be edited right now|user may be dragging a tab/i.test(message);
}

export async function retryTransientTabAction<T>(
  label: string,
  action: () => Promise<T>,
  options: RetryTransientTabActionOptions = {},
): Promise<T> {
  const attempts = Math.max(1, Math.floor(options.attempts ?? DEFAULT_ATTEMPTS));
  const baseDelayMs = Math.max(0, options.baseDelayMs ?? DEFAULT_BASE_DELAY_MS);
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await action();
    } catch (error) {
      lastError = error;
      if (!isTransientTabActionError(error) || attempt >= attempts) throw error;
      log.warn(`${label} hit transient Chrome tab lock; retrying (${attempt}/${attempts - 1})`);
      await sleep(baseDelayMs * attempt);
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
