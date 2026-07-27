import type { PlatformId } from '../types/platform';
import { readFreshCapturedPost } from '../utils/post-capture-record';

const STORED_API_CAPTURE_KEYS: Partial<Record<PlatformId, string>> = {
  instagram: 'tutti:ig-latest-post',
  mastodon: 'tutti:mastodon-latest-post',
  threads: 'tutti:threads-latest-post',
  tumblr: 'tutti:tumblr-latest-post',
};

export function storedApiCaptureKey(
  platform: PlatformId,
): string | undefined {
  return STORED_API_CAPTURE_KEYS[platform];
}

export async function captureStoredApiPostUrl(
  platform: PlatformId,
  tabId: number,
  text: string,
  debug: (message: string) => void,
  minCapturedAt?: number,
): Promise<string | undefined> {
  const key = storedApiCaptureKey(platform);
  if (!key) return undefined;

  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const results = await browser.scripting.executeScript({
        target: { tabId },
        func: (storageKey: string) => {
          try {
            return localStorage.getItem(storageKey);
          } catch {
            return null;
          }
        },
        args: [key],
        world: 'MAIN',
      });
      const raw = results?.[0]?.result;
      const record = readFreshCapturedPost(
        typeof raw === 'string' ? raw : null,
        text,
        120_000,
      );
      if (record && minCapturedAt && record.capturedAt < minCapturedAt) {
        debug(
          `stored API response is stale ` +
          `(capturedAt=${record.capturedAt}, min=${minCapturedAt})`,
        );
        await sleep(500);
        continue;
      }
      if (record?.url) {
        debug(`URL captured via stored API response: ${record.url}`);
        return record.url;
      }
    } catch (error) {
      debug(
        `stored API response read failed: ` +
        `${error instanceof Error ? error.message : String(error)}`,
      );
      return undefined;
    }
    await sleep(500);
  }
  debug('stored API response URL not found');
  return undefined;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
