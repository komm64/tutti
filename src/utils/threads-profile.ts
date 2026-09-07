import { log } from './logger';
import { withTimeout } from './promise-timeout';

const THREADS_ORIGIN = 'https://www.threads.com';

/** Return a positively observed URL; an unavailable or empty page is unknown. */
export async function fetchLatestThreadsPostUrl(
  username: string,
  timeoutMs = 5_000,
): Promise<string | undefined> {
  const controller = new AbortController();
  try {
    return await withTimeout((async () => {
      const response = await fetch(`${THREADS_ORIGIN}/@${encodeURIComponent(username)}`, {
        credentials: 'include',
        signal: controller.signal,
      });
      if (!response.ok) return undefined;
      const doc = new DOMParser().parseFromString(await response.text(), 'text/html');
      return findLatestThreadsPostUrlInDocument(doc, username, THREADS_ORIGIN);
    })(), timeoutMs, 'Threads profile snapshot', () => controller.abort());
  } catch (error) {
    log.warn(`threads: latest profile URL capture failed: ${error instanceof Error ? error.message : String(error)}`);
    return undefined;
  }
}

export function findLatestThreadsPostUrlInDocument(
  doc: Document,
  username: string,
  origin: string,
): string | undefined {
  const profilePrefix = `/@${username}/post/`.toLowerCase();
  for (const link of doc.querySelectorAll<HTMLAnchorElement>('a[href*="/post/"]')) {
    const url = normalizeThreadsPostUrl(link.getAttribute('href') ?? '', origin);
    if (url && new URL(url).pathname.toLowerCase().startsWith(profilePrefix)) return url;
  }
  return undefined;
}

export function normalizeThreadsPostUrl(href: string, origin: string): string | undefined {
  try {
    const url = new URL(href, origin);
    const match = url.href.match(/^https:\/\/(?:www\.)?threads\.(?:com|net)\/@([^/]+)\/post\/([\w-]+)(?:[/?#]|$)/);
    if (!match?.[1] || !match?.[2]) return undefined;
    return `${THREADS_ORIGIN}/@${match[1]}/post/${match[2]}`;
  } catch {
    return undefined;
  }
}
