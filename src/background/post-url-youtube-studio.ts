import { buildYouTubeTitle } from '../adapters/youtube';
import { t } from '../utils/i18n';
import { waitForWebActionPacing } from '../utils/web-action-pacing';
import { retryTransientTabAction } from './tab-action-retry';
import { waitForTabComplete } from './tab-management';

export interface YouTubeStudioCaptureResult {
  url?: string;
  trace: string[];
}

export interface YouTubeStudioDispatchState {
  channelReady: boolean;
  dashboardReady: boolean;
  documentTimeOrigin: number;
}

const YOUTUBE_STUDIO_DISPATCH_TIMEOUT_MS = 45_000;
const YOUTUBE_STUDIO_DOCUMENT_STABILITY_MS = 750;
const YOUTUBE_STUDIO_DISPATCH_POLL_MS = 250;
/** Each Studio tab is polled for 15 s; both tabs are searched per pass. */
const STUDIO_LIST_CAPTURE_ATTEMPTS = 30;

/**
 * Studio briefly exposes a usable document at `/` before replacing it with the
 * channel dashboard. Sending the upload request to that first document loses
 * the async response as soon as the replacement navigation commits. Wait for
 * the channel dashboard and ensure its document survives a short stability
 * window before the one media-bearing dispatch is allowed to start.
 */
export async function waitForYouTubeStudioDispatchReady(
  tabId: number,
  timeoutMs = YOUTUBE_STUDIO_DISPATCH_TIMEOUT_MS,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let stableDocumentTimeOrigin: number | undefined;
  let stableSince = 0;

  while (Date.now() < deadline) {
    const state = await browser.scripting.executeScript({
      target: { tabId },
      func: inspectYouTubeStudioDispatchStateInPage,
      world: 'ISOLATED',
    }).then(
      (results) => results?.[0]?.result as YouTubeStudioDispatchState | undefined,
      () => undefined,
    );

    if (state?.channelReady && state.dashboardReady) {
      if (stableDocumentTimeOrigin !== state.documentTimeOrigin) {
        stableDocumentTimeOrigin = state.documentTimeOrigin;
        stableSince = Date.now();
      } else if (Date.now() - stableSince >= YOUTUBE_STUDIO_DOCUMENT_STABILITY_MS) {
        return;
      }
    } else {
      stableDocumentTimeOrigin = undefined;
      stableSince = 0;
    }

    await sleep(YOUTUBE_STUDIO_DISPATCH_POLL_MS);
  }

  throw new Error(t('runtimeYouTubeUploadButtonMissing'));
}

export function inspectYouTubeStudioDispatchStateInPage(
  root: ParentNode = document,
  pageUrl: string = location.href,
  documentTimeOrigin: number = performance.timeOrigin,
): YouTubeStudioDispatchState {
  let channelReady = false;
  try {
    const url = new URL(pageUrl);
    channelReady = url.hostname === 'studio.youtube.com' &&
      /^\/channel\/[^/]+(?:\/|$)/.test(url.pathname);
  } catch {
    channelReady = false;
  }

  return {
    channelReady,
    dashboardReady: Boolean(root.querySelector(
      '#upload-button, #upload-icon, [aria-label="Upload videos"], ' +
      '[aria-label="動画をアップロード"]',
    )),
    documentTimeOrigin,
  };
}

/**
 * Last-resort lookup when the upload wizard did not expose the video ID.
 *
 * Studio lists Shorts only on the Shorts tab and regular uploads only on the
 * Videos tab; Tutti's uploads are normally Shorts, so that tab is searched
 * first. Only the newest row of each newest-first list is accepted, so an
 * older upload with the same title is never reported as this post.
 */
export async function captureYouTubeStudioPostUrlFromTab(
  tabId: number,
  sourceText: string,
  debug: (message: string) => void,
): Promise<string | undefined> {
  const targetTitle = buildYouTubeStudioCaptureTarget(sourceText);
  const contentUrls = await resolveYouTubeStudioContentUrlsFromTab(tabId);
  for (const contentUrl of contentUrls) {
    debug(`open newest-first Studio content list for URL lookup: ${contentUrl}`);
    await retryTransientTabAction('open YouTube Studio content list for URL capture', async () => {
      await waitForWebActionPacing('navigation');
      return await browser.tabs.update(tabId, { url: contentUrl });
    });
    await waitForTabComplete(tabId);

    const results = await browser.scripting.executeScript({
      target: { tabId },
      func: captureYouTubeStudioPostUrlInPage,
      args: [targetTitle, STUDIO_LIST_CAPTURE_ATTEMPTS],
      world: 'MAIN',
    });
    debug(`scripting result count=${results?.length}`);
    const result = results?.[0]?.result as YouTubeStudioCaptureResult | null | undefined;
    for (const line of result?.trace?.slice(0, 30) ?? []) {
      debug(`  ${line}`);
    }
    if (typeof result?.url === 'string') {
      debug(`URL captured: ${result.url}`);
      return result.url;
    }
  }
  debug('URL not found');
  return undefined;
}

export function buildYouTubeStudioCaptureTarget(sourceText: string): string {
  return buildYouTubeTitle(sourceText).replace(/\s+/g, ' ').trim().slice(0, 60);
}

export type YouTubeStudioContentTab = 'short' | 'upload';

export function buildYouTubeStudioContentUrl(
  rawUrl: string,
  tab: YouTubeStudioContentTab = 'upload',
): string | undefined {
  try {
    const url = new URL(rawUrl);
    const channelId = url.pathname.match(/^\/channel\/([^/]+)/)?.[1];
    if (url.hostname !== 'studio.youtube.com' || !channelId) return undefined;
    return (
      `https://studio.youtube.com/channel/${channelId}/videos/${tab}` +
      '?filter=%5B%5D&sort=%7B%22columnType%22%3A%22date%22%2C%22sortOrder%22%3A%22DESCENDING%22%7D'
    );
  } catch {
    return undefined;
  }
}

export function buildYouTubeStudioContentUrls(rawUrl: string): string[] | undefined {
  const urls = (['short', 'upload'] as const)
    .map((tab) => buildYouTubeStudioContentUrl(rawUrl, tab));
  return urls.every((url): url is string => url !== undefined) ? urls : undefined;
}

export async function captureYouTubeStudioPostUrlInPage(
  targetText: string,
  maxAttempts = 30,
  root: ParentNode = document,
): Promise<YouTubeStudioCaptureResult> {
  const trace: string[] = [];
  const normalize = (value: string | null | undefined): string => (
    (value ?? '').replace(/\s+/g, ' ').trim()
  );

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const newestLink = root.querySelector<HTMLAnchorElement>('a[href*="/video/"]');
    const id = newestLink?.href.match(/\/video\/([\w-]+)(?:\/|$)/)?.[1];
    const row = newestLink?.closest('ytcp-video-row') ?? newestLink?.parentElement ?? null;
    if (id && row && normalize(row.textContent).includes(targetText)) {
      trace.push(`matched target title in the newest Studio row (attempt=${attempt})`);
      return { url: `https://www.youtube.com/watch?v=${id}`, trace };
    }
    if (attempt === 0) {
      trace.push(`newest Studio row ${id ? 'does not match the target title' : 'not found'}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  return { trace };
}

async function resolveYouTubeStudioContentUrlsFromTab(tabId: number): Promise<string[]> {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const tab = await browser.tabs.get(tabId);
    const contentUrls = buildYouTubeStudioContentUrls(
      tab.url ?? tab.pendingUrl ?? '',
    );
    if (contentUrls) return contentUrls;
    await sleep(500);
  }
  throw new Error('YouTube Studio channel URL was not available before posting');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
