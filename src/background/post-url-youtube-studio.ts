import { buildYouTubeTitle } from '../adapters/youtube';
import { t } from '../utils/i18n';
import { waitForWebActionPacing } from '../utils/web-action-pacing';
import { retryTransientTabAction } from './tab-action-retry';
import { closeTabSafely, waitForTabComplete } from './tab-management';

export interface YouTubeStudioCaptureResult {
  url?: string;
  trace: string[];
}

export interface YouTubeStudioPostIdBaselineState {
  ids: string[];
  settled: boolean;
}

export interface YouTubeStudioDispatchState {
  channelReady: boolean;
  dashboardReady: boolean;
  documentTimeOrigin: number;
}

const YOUTUBE_STUDIO_DISPATCH_TIMEOUT_MS = 45_000;
const YOUTUBE_STUDIO_DOCUMENT_STABILITY_MS = 750;
const YOUTUBE_STUDIO_DISPATCH_POLL_MS = 250;

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

export async function captureYouTubeStudioPostIdsFromTab(
  tabId: number,
  debug: (message: string) => void,
): Promise<string[]> {
  const contentUrl = await resolveYouTubeStudioContentUrlFromTab(tabId);
  const sourceTab = await browser.tabs.get(tabId);
  debug(`open isolated Studio content snapshot before posting: ${contentUrl}`);
  const snapshotTab = await retryTransientTabAction(
    'open YouTube Studio content snapshot before posting',
    async () => {
      await waitForWebActionPacing('navigation');
      return await browser.tabs.create({
        url: contentUrl,
        active: false,
        ...(typeof sourceTab.windowId === 'number'
          ? { windowId: sourceTab.windowId }
          : {}),
      });
    },
  );
  if (typeof snapshotTab.id !== 'number') {
    throw new Error('YouTube Studio baseline snapshot tab was not created');
  }

  try {
    await waitForTabComplete(snapshotTab.id);
    for (let attempt = 0; attempt < 60; attempt += 1) {
      const results = await browser.scripting.executeScript({
        target: { tabId: snapshotTab.id },
        func: captureYouTubeStudioPostIdBaselineStateInPage,
        world: 'MAIN',
      });
      const state = results?.[0]?.result as
        | YouTubeStudioPostIdBaselineState
        | null
        | undefined;
      if (
        state?.settled === true &&
        Array.isArray(state.ids)
      ) {
        debug(
          `captured pre-submit video ID baseline: count=${state.ids.length}, ` +
          `attempt=${attempt}`,
        );
        return state.ids;
      }
      if (attempt === 0) {
        debug('waiting for Studio content rows to settle before baseline capture');
      }
      await sleep(500);
    }
    throw new Error('YouTube Studio baseline list did not settle');
  } finally {
    await closeTabSafely(snapshotTab.id);
  }
}

export async function captureYouTubeStudioPostUrlFromTab(
  tabId: number,
  sourceText: string,
  excludedPostIds: readonly string[] | undefined,
  debug: (message: string) => void,
): Promise<string | undefined> {
  const targetTitle = buildYouTubeStudioCaptureTarget(sourceText);
  const contentUrl = await resolveYouTubeStudioContentUrlFromTab(tabId);
  debug(`open newest-first Studio content list for URL lookup: ${contentUrl}`);
  await retryTransientTabAction('open YouTube Studio content list for URL capture', async () => {
    await waitForWebActionPacing('navigation');
    return await browser.tabs.update(tabId, { url: contentUrl });
  });
  await waitForTabComplete(tabId);

  const results = await browser.scripting.executeScript({
    target: { tabId },
    func: captureYouTubeStudioPostUrlInPage,
    args: [targetTitle, [...(excludedPostIds ?? [])]],
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
  debug('URL not found');
  return undefined;
}

export function buildYouTubeStudioCaptureTarget(sourceText: string): string {
  return buildYouTubeTitle(sourceText).replace(/\s+/g, ' ').trim().slice(0, 60);
}

export function buildYouTubeStudioContentUrl(rawUrl: string): string | undefined {
  try {
    const url = new URL(rawUrl);
    const channelId = url.pathname.match(/^\/channel\/([^/]+)/)?.[1];
    if (url.hostname !== 'studio.youtube.com' || !channelId) return undefined;
    return (
      `https://studio.youtube.com/channel/${channelId}/videos/upload` +
      '?filter=%5B%5D&sort=%7B%22columnType%22%3A%22date%22%2C%22sortOrder%22%3A%22DESCENDING%22%7D'
    );
  } catch {
    return undefined;
  }
}

export function captureYouTubeStudioPostIdsInPage(
  root: ParentNode = document,
): string[] {
  return captureYouTubeStudioPostIdBaselineStateInPage(root).ids;
}

export function captureYouTubeStudioPostIdBaselineStateInPage(
  root: ParentNode = document,
): YouTubeStudioPostIdBaselineState {
  const ids = new Set<string>();
  for (const link of Array.from(
    root.querySelectorAll<HTMLAnchorElement>('a[href*="/video/"]'),
  )) {
    const id = link.href.match(/\/video\/([\w-]+)(?:\/|$)/)?.[1];
    if (id) ids.add(id);
  }
  const emptyState = root.querySelector(
    'ytcp-video-list-empty-state, ytcp-empty-state, ' +
    '[id*="empty-state"], [class*="empty-state"]',
  );
  const documentRoot = root as ParentNode & {
    body?: HTMLElement;
    documentElement?: HTMLElement;
  };
  const rootText = documentRoot.body?.innerText ??
    documentRoot.documentElement?.textContent ??
    root.textContent ??
    '';
  const explicitEmptyText = (
    /\bno (?:videos|content)(?: available| found)?\b/i.test(rootText) ||
    /(?:動画|コンテンツ)(?:は|が)?ありません/.test(rootText)
  );
  return {
    ids: [...ids],
    settled: ids.size > 0 || emptyState !== null || explicitEmptyText,
  };
}

export async function captureYouTubeStudioPostUrlInPage(
  targetText: string,
  excludedPostIds: readonly string[] = [],
  root: ParentNode = document,
): Promise<YouTubeStudioCaptureResult> {
  const trace: string[] = [];
  const excluded = new Set(excludedPostIds);

  const normalize = (value: string | null | undefined): string => (
    (value ?? '').replace(/\s+/g, ' ').trim()
  );
  const titleSelector = 'h1, h2, h3, [id*="title"], ytcp-thumbnail-with-title';

  for (let attempt = 0; attempt < 120; attempt += 1) {
    const titleNodes = Array.from(
      root.querySelectorAll<HTMLElement>(titleSelector),
    )
      .filter((element) => normalize(element.textContent).includes(targetText))
      .sort(
        (first, second) => (
          normalize(first.textContent).length - normalize(second.textContent).length
        ),
      );

    for (const titleNode of titleNodes) {
      let scope: Element | null = titleNode;
      for (
        let depth = 0;
        scope && depth < 8;
        depth += 1, scope = scope.parentElement
      ) {
        const links = Array.from(
          scope.querySelectorAll<HTMLAnchorElement>('a[href*="/video/"]'),
        );
        for (const link of links) {
          const id = link.href.match(/\/video\/([\w-]+)(?:\/|$)/)?.[1];
          if (id && !excluded.has(id)) {
            trace.push(
              `matched new target title in scoped video card ` +
              `(attempt=${attempt}, depth=${depth}, excluded=${excluded.size})`,
            );
            return {
              url: `https://www.youtube.com/watch?v=${id}`,
              trace,
            };
          }
        }
      }
    }

    if (attempt === 0) {
      trace.push(
        `target title matches=${titleNodes.length}, excluded IDs=${excluded.size}`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  return { trace };
}

async function resolveYouTubeStudioContentUrlFromTab(tabId: number): Promise<string> {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const tab = await browser.tabs.get(tabId);
    const contentUrl = buildYouTubeStudioContentUrl(
      tab.url ?? tab.pendingUrl ?? '',
    );
    if (contentUrl) return contentUrl;
    await sleep(500);
  }
  throw new Error('YouTube Studio channel URL was not available before posting');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
