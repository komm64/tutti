import type { PlatformId } from '../types/platform';
import { waitForTabComplete } from './tab-management';
import {
  captureRenderedProfilePostUrl,
  isRenderedProfileFallbackPlatform,
} from './post-url-rendered-profile';
import { retryTransientTabAction } from './tab-action-retry';
import { captureStoredApiPostUrl } from './post-url-stored-api';
import { captureMastodonPostViaPublicApi } from './post-url-mastodon-api';
import { capturePostUrlInPage } from './post-url-in-page';

export interface CapturePostUrlOptions {
  platform: PlatformId;
  tabId: number;
  text: string;
  expectedUser?: string;
  minCapturedAt?: number;
  onDebug?: (message: string) => void;
  frameRetry?: number;
}

export interface CapturePostUrlRetryStep {
  label: string;
  delayMs: number;
}

export type PostUrlCaptureScriptArgs = [
  platform: PlatformId,
  targetText: string,
  expectedUserName: string | null,
  minCapturedAt: number | null,
];

export function buildPostUrlCaptureRetryPlan(platform: PlatformId): CapturePostUrlRetryStep[] {
  const steps: CapturePostUrlRetryStep[] = [{ label: 'immediate', delayMs: 0 }];
  if (platform === 'youtube') {
    return [
      ...steps,
      { label: 'processing-settle', delayMs: 15000 },
      { label: 'final-dashboard-refresh', delayMs: 30000 },
    ];
  }

  if (platform === 'instagram') {
    return [
      ...steps,
      { label: 'settled-page', delayMs: 3000 },
      { label: 'late-api-response', delayMs: 10000 },
    ];
  }

  if (platform === 'threads' || platform === 'tumblr') {
    return [
      ...steps,
      { label: 'late-api-or-profile', delayMs: 10000 },
      { label: 'final-profile-settle', delayMs: 30000 },
    ];
  }

  const needsLateProfile = platform === 'x' ||
    platform === 'pixiv' ||
    platform === 'tiktok';

  if (needsLateProfile) {
    return [
      ...steps,
      { label: 'late-api-or-profile', delayMs: 10000 },
    ];
  }

  steps.push({ label: 'settled-page', delayMs: 3000 });
  return steps;
}

export function buildPostUrlCaptureScriptArgs(
  platform: PlatformId,
  targetText: string,
  expectedUserName?: string,
  minCapturedAt?: number,
): PostUrlCaptureScriptArgs {
  return [
    platform,
    targetText,
    expectedUserName ?? null,
    typeof minCapturedAt === 'number' && Number.isFinite(minCapturedAt) ? minCapturedAt : null,
  ];
}

export async function captureYouTubeStudioPostUrlInPage(
  targetText: string,
  root: ParentNode = document,
): Promise<{ url?: string; trace: string[] }> {
  const trace: string[] = [];
  if (!targetText) return { trace };

  const normalize = (value: string | null | undefined): string => (
    (value ?? '').replace(/\s+/g, ' ').trim()
  );
  const titleSelector = 'h1, h2, h3, [id*="title"], ytcp-thumbnail-with-title';

  for (let attempt = 0; attempt < 120; attempt += 1) {
    const titleNodes = Array.from(root.querySelectorAll<HTMLElement>(titleSelector))
      .filter((element) => normalize(element.textContent).includes(targetText))
      .sort((a, b) => normalize(a.textContent).length - normalize(b.textContent).length);

    for (const titleNode of titleNodes) {
      let scope: Element | null = titleNode;
      for (let depth = 0; scope && depth < 8; depth += 1, scope = scope.parentElement) {
        const links = Array.from(scope.querySelectorAll<HTMLAnchorElement>('a[href*="/video/"]'));
        for (const link of links) {
          const id = link.href.match(/\/video\/([\w-]+)(?:\/|$)/)?.[1];
          if (id) {
            trace.push(`matched target title in scoped video card (attempt=${attempt}, depth=${depth})`);
            return { url: `https://www.youtube.com/watch?v=${id}`, trace };
          }
        }
      }
    }

    if (attempt === 0) {
      trace.push(`target title matches=${titleNodes.length}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  return { trace };
}

export async function capturePostUrlFromTabWithRetry(
  options: CapturePostUrlOptions,
): Promise<string | undefined> {
  const steps = buildPostUrlCaptureRetryPlan(options.platform);
  for (let i = 0; i < steps.length; i += 1) {
    const step = steps[i]!;
    if (step.delayMs > 0) await sleep(step.delayMs);
    if (i > 0) {
      options.onDebug?.(`[capturePostUrl ${options.platform}] retry pass "${step.label}"`);
    }
    const url = await capturePostUrlFromTab(options);
    if (url) return url;
  }
  return undefined;
}

/**
 * v0.5.8+ post 後の URL を tab 側 API で取得する。
 * navigation や channel-closed で content script の URL 取得が間に合わないケースの補完。
 */
export async function capturePostUrlFromTab(options: CapturePostUrlOptions): Promise<string | undefined> {
  const {
    platform,
    tabId,
    text,
    expectedUser,
    minCapturedAt,
    onDebug,
    frameRetry = 0,
  } = options;
  const dbg = (message: string): void => {
    onDebug?.(`[capturePostUrl ${platform}] ${message}`);
  };
  dbg(`start (tabId=${tabId}, text="${text.slice(0, 30)}...", minCapturedAt=${minCapturedAt ?? 'none'})`);

  const storedApiUrl = await captureStoredApiPostUrl(platform, tabId, text, dbg, minCapturedAt);
  if (storedApiUrl) return storedApiUrl;
  const profileExpectedUser = await resolveExpectedUserForCapture(platform, expectedUser, dbg);

  if (platform === 'mastodon') {
    const publicApiUrl = await captureMastodonPostViaPublicApi(tabId, text, profileExpectedUser, dbg);
    if (publicApiUrl) return publicApiUrl;
  }

  let triedRenderedProfileFallback = false;
  if (platform === 'threads' && profileExpectedUser) {
    triedRenderedProfileFallback = true;
    const renderedUrl = await captureRenderedProfilePostUrl(platform, tabId, text, dbg, profileExpectedUser);
    if (renderedUrl) return renderedUrl;
  }

  try {
    if (platform === 'tumblr') {
      await sleep(1000);
    }
    if (platform === 'youtube') {
      dbg('reload Studio dashboard before latest Short lookup');
      await retryTransientTabAction('reload YouTube Studio before URL capture', () => (
        browser.tabs.reload(tabId)
      ));
      await waitForTabComplete(tabId);
      await sleep(1000);
    }

    const target = text.replace(/\s+/g, ' ').trim().slice(0, 60);
    if (platform === 'youtube') {
      const youtubeResults = await browser.scripting.executeScript({
        target: { tabId },
        func: captureYouTubeStudioPostUrlInPage,
        args: [target],
        world: 'MAIN',
      });
      dbg(`scripting result count=${youtubeResults?.length}`);
      const youtubeResult = youtubeResults?.[0]?.result as {
        url?: string;
        trace?: string[];
      } | null | undefined;
      for (const line of youtubeResult?.trace?.slice(0, 30) ?? []) {
        dbg(`  ${line}`);
      }
      if (typeof youtubeResult?.url === 'string') {
        dbg(`URL captured: ${youtubeResult.url}`);
        return youtubeResult.url;
      }
      dbg('URL not found');
      return undefined;
    }

    const scriptArgs = buildPostUrlCaptureScriptArgs(
      platform,
      target,
      profileExpectedUser,
      minCapturedAt,
    );
    const results = await browser.scripting.executeScript({
      target: { tabId },
      func: capturePostUrlInPage,
      args: scriptArgs,
      world: 'MAIN',
    });

    dbg(`scripting result count=${results?.length}`);
    const r = results?.[0]?.result as { url?: string; trace?: string[] } | null | undefined;
    if (r?.trace) {
      for (const line of r.trace.slice(0, 30)) dbg(`  ${line}`);
    }
    if (typeof r?.url === 'string') {
      dbg(`URL captured: ${r.url}`);
      return r.url;
    }

    if (isRenderedProfileFallbackPlatform(platform) && !triedRenderedProfileFallback) {
      const renderedUrl = await captureRenderedProfilePostUrl(platform, tabId, text, dbg, profileExpectedUser);
      if (renderedUrl) return renderedUrl;
    }
    dbg('URL not found');
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    dbg(`exception: ${message}`);
    if (/Frame with ID/i.test(message) && /was removed/i.test(message) && frameRetry < 2) {
      await sleep(1000);
      dbg(`retry after frame replacement (${frameRetry + 1}/2)`);
      return capturePostUrlFromTab({
        platform,
        tabId,
        text,
        expectedUser,
        minCapturedAt,
        onDebug,
        frameRetry: frameRetry + 1,
      });
    }
  }
  return undefined;
}

async function resolveExpectedUserForCapture(
  platform: PlatformId,
  expectedUser: string | undefined,
  dbg: (message: string) => void,
): Promise<string | undefined> {
  const direct = expectedUser?.trim();
  if (direct) return direct;
  try {
    const stored = await browser.storage.local.get('lastSeenUsers');
    const users = stored['lastSeenUsers'] as Partial<Record<PlatformId, string>> | undefined;
    const fromStorage = users?.[platform]?.trim();
    if (fromStorage) {
      dbg(`expected user resolved from storage: ${fromStorage}`);
      return fromStorage;
    }
  } catch (e) {
    dbg(`expected user storage lookup failed: ${e instanceof Error ? e.message : String(e)}`);
  }
  return undefined;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
