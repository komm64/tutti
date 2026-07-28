import type { PlatformId } from '../types/platform';
import {
  captureRenderedProfilePostUrl,
  isRenderedProfileFallbackPlatform,
} from './post-url-rendered-profile';
import { captureStoredApiPostUrl } from './post-url-stored-api';
import { captureMastodonPostViaPublicApi } from './post-url-mastodon-api';
import { capturePostUrlInPage } from './post-url-in-page';
import { captureYouTubeStudioPostUrlFromTab } from './post-url-youtube-studio';

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
    const target = text.replace(/\s+/g, ' ').trim().slice(0, 60);
    if (platform === 'youtube') {
      return await captureYouTubeStudioPostUrlFromTab(tabId, target, dbg);
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
