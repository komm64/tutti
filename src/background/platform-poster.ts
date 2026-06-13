import type {
  ImageAttachment,
  PlatformId,
  PostResultMessage,
  PostToPlatformMessage,
} from '../messages';
import type { PlatformAdapter } from '../adapters/types';
import { getLastSeenUsers, getSettings } from '../storage';
import { splitTextForPlatform } from '../utils/platform-text';
import { isVerifySupported } from '../utils/post-verify';
import { log } from '../utils/logger';
import { t } from '../utils/i18n';
import { runVerify } from './verify-dispatcher';
import { openOrFocusTab } from './tab-management';
import { tryApiPath } from './api-posting';
import { capturePostUrlFromTabWithRetry } from './post-url-capture';
import { sendPostMessageWhenReady } from './content-dispatch';
import { resolveAdapter } from './adapter-resolver';
import { prepareMediaForPlatform } from './platform-media';
import { maybeResizeImagesForPlatform } from './media-preprocess';
import { downgradeHardVerifyFailures, toPreviewResult } from './post-result-policy';
import type { OpenedTabRegistry } from './opened-tab-registry';
import { retryTransientTabAction } from './tab-action-retry';

const CHUNK_INTERVAL_MS = 2000;
const PRE_SUBMIT_LOAD_RETRY_PLATFORMS = new Set<PlatformId>(['mastodon']);

type Visibility = 'public' | 'unlisted' | 'private' | 'direct';

export interface DomPostAttempt {
  label: string;
  skipApi?: boolean;
  forceActive?: boolean;
  reuseExistingTab?: boolean;
  loadRetries?: number;
  delayBeforeMs?: number;
}

export interface PlatformPosterOptions {
  openedTabs: Pick<OpenedTabRegistry, 'record'>;
  appendBackgroundLog?: (message: string) => void;
}

export function createPlatformPoster(options: PlatformPosterOptions) {
  async function postToPlatform(
    platform: PlatformId,
    text: string,
    images?: ImageAttachment[],
    cw?: string,
    visibility?: Visibility,
    autoPost = true,
  ): Promise<PostResultMessage> {
    const adapter = await resolveAdapter(platform);
    if (!adapter) {
      return {
        type: 'POST_RESULT',
        platform,
        success: false,
        error: t('runtimeUnsupportedPlatform'),
      };
    }

    const media = await prepareMediaForPlatform(adapter, platform, images);
    if (!media.ok) return media.result;
    images = media.images;

    const chunks = splitTextForPlatform(adapter.id, text, adapter.charLimit);

    // X autoPost needs URL-confirmed reply chaining; preview keeps inline compose.
    const useInlineThread = adapter.id === 'bluesky' || (adapter.id === 'x' && !autoPost);
    if (useInlineThread && chunks.length > 1) {
      return await postSingleChunkInlineThread(adapter, chunks, images, autoPost);
    }

    let prevPostUrl: string | undefined;
    let allConfirmed = true;
    for (let i = 0; i < chunks.length; i++) {
      if (i > 0) await sleep(CHUNK_INTERVAL_MS);
      const chunkImages = i === 0 ? images : undefined;
      const overrideUrl = buildReplyOverrideUrl(adapter.id, i, prevPostUrl);

      try {
        const result = await postSingleChunkWithRetry(
          adapter,
          chunks[i]!,
          chunkImages,
          undefined,
          overrideUrl,
          cw,
          visibility,
          autoPost,
        );

        if (!result.success) {
          return {
            ...result,
            error: chunks.length > 1
              ? t('runtimeChunkContext', i + 1, chunks.length, result.error ?? t('runtimePostUncertain'))
              : result.error,
          };
        }
        if (result.url) prevPostUrl = result.url;
        if (!result.confirmed && !result.url) allConfirmed = false;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          type: 'POST_RESULT',
          platform,
          success: false,
          error: chunks.length > 1 ? t('runtimeChunkFailed', i + 1, chunks.length, msg) : msg,
        };
      }
    }

    const finalResultBase: PostResultMessage = {
      type: 'POST_RESULT',
      platform,
      success: true,
      confirmed: allConfirmed,
      url: prevPostUrl,
    };
    let finalResult = autoPost ? finalResultBase : toPreviewResult(finalResultBase);

    if (autoPost && prevPostUrl && isVerifySupported(platform)) {
      await attachVerifyResult(finalResult, platform, prevPostUrl, chunks, text, images);
      finalResult = downgradeHardVerifyFailures(finalResult);
    }

    if (autoPost && prevPostUrl) {
      void maybeAutoOpenPostUrl(prevPostUrl, finalResult.verify);
    }

    return finalResult;
  }

  async function postSingleChunkInlineThread(
    adapter: PlatformAdapter,
    chunks: string[],
    images?: ImageAttachment[],
    autoPost = true,
  ): Promise<PostResultMessage> {
    log.info(`${adapter.id}: inline thread compose で ${chunks.length} chunks を 1 つの compose に並べる`);
    return await postSingleChunkWithRetry(adapter, chunks[0]!, images, chunks, undefined, undefined, undefined, autoPost);
  }

  async function postSingleChunkWithRetry(
    adapter: PlatformAdapter,
    text: string,
    rawImages?: ImageAttachment[],
    textChunks?: string[],
    overrideUrl?: string,
    cw?: string,
    visibility?: Visibility,
    autoPost = true,
  ): Promise<PostResultMessage> {
    const attempts = buildDomPostAttempts(adapter, autoPost);
    let lastError: unknown;
    for (let i = 0; i < attempts.length; i += 1) {
      const attempt = attempts[i]!;
      if (attempt.delayBeforeMs) await sleep(attempt.delayBeforeMs);
      try {
        return await postSingleChunk(
          adapter,
          text,
          rawImages,
          textChunks,
          overrideUrl,
          cw,
          visibility,
          autoPost,
          attempt,
        );
      } catch (err) {
        lastError = err;
        if (i >= attempts.length - 1) throw err;
        const next = attempts[i + 1]!;
        log.warn(
          `${adapter.id}: pre-submit attempt "${attempt.label}" failed before the post action; ` +
          `retrying with "${next.label}": ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError ?? t('runtimeUnknownError')));
  }

  async function postSingleChunk(
    adapter: PlatformAdapter,
    text: string,
    rawImages?: ImageAttachment[],
    textChunks?: string[],
    overrideUrl?: string,
    cw?: string,
    visibility?: Visibility,
    autoPost = true,
    attempt: DomPostAttempt = { label: 'default' },
  ): Promise<PostResultMessage> {
    const images = rawImages ? await maybeResizeImagesForPlatform(adapter, rawImages) : undefined;

    if (autoPost && !overrideUrl && !textChunks && !attempt.skipApi) {
      const apiResult = await tryApiPath(adapter.id, text, images, cw, visibility);
      if (apiResult === 'no-credentials') {
        // Fall through to DOM path.
      } else if (apiResult.success) {
        log.info(`${adapter.id} via API ✓ ${apiResult.postUrl ?? ''}`);
        return { type: 'POST_RESULT', platform: adapter.id, success: true, confirmed: true, url: apiResult.postUrl };
      } else if (apiResult.uncertain) {
        log.warn(`${adapter.id} via API: post result uncertain - ${apiResult.error ?? t('runtimeUnknownError')}`);
        return unconfirmedPostResult(adapter.id);
      } else {
        log.warn(`${adapter.id} via API failed before a confirmed post; falling back to DOM path: ${apiResult.error ?? t('runtimeUnknownError')}`);
      }
    }

    const dryRun = !autoPost;
    const active = attempt.forceActive === true || shouldOpenActive(adapter, dryRun, textChunks);
    const openOptions = PRE_SUBMIT_LOAD_RETRY_PLATFORMS.has(adapter.id)
      ? { loadRetries: 1, relaxedComposeUrlReady: true }
      : undefined;
    const { tab, wasCreated } = await openOrFocusTab(
      overrideUrl ?? adapter.getComposeUrl(text),
      adapter.matchUrl,
      active,
      {
        ...openOptions,
        loadRetries: Math.max(openOptions?.loadRetries ?? 0, attempt.loadRetries ?? 0),
        // Real posts must start from a clean compose surface.
        // Reusing broad domain matches (for example instagram.com/ or x.com/compose/post)
        // can collide with preview drafts left open by the previous request.
        // Preview still reuses tabs so local mock smoke and manual inspection stay lightweight.
        reuseExistingTab: attempt.reuseExistingTab ?? dryRun,
      },
    );
    if (typeof tab.id !== 'number') {
      throw new Error(t('runtimeSnsTabOpenFailed'));
    }
    if (wasCreated && !dryRun) options.openedTabs.record(adapter.id, tab.id);

    const lastSeenUsers = await getLastSeenUsers();
    const expectedUser = lastSeenUsers[adapter.id] ?? undefined;
    const message: PostToPlatformMessage = {
      type: 'POST_TO_PLATFORM',
      platform: adapter.id,
      text,
      textChunks,
      images,
      dryRun,
      expectedUser,
      cw,
      visibility,
    };

    let response: PostResultMessage | undefined;
    try {
      response = await sendPostMessageWhenReady(tab.id, message);
    } catch (err) {
      const recovered = await recoverFromMaybeLandedChannelClose(err, adapter.id, tab.id, text, expectedUser, dryRun);
      if (recovered) return recovered;
      throw err;
    }

    if (!response) {
      throw new Error(t('runtimeSnsPageNoResponse'));
    }
    if (!response.success) {
      if (response.uncertain) return response;
      throw new Error(response.error ?? t('runtimePostFailed'));
    }
    if (dryRun) return toPreviewResult(response);

    const withUrl = await ensurePostUrl(response, adapter.id, tab.id, text, expectedUser);
    if (withUrl.url) return { ...withUrl, confirmed: true };
    if (withUrl.confirmed && adapter.id !== 'threads') return withUrl;
    return unconfirmedPostResult(adapter.id);
  }

  async function recoverFromMaybeLandedChannelClose(
    err: unknown,
    platform: PlatformId,
    tabId: number,
    text: string,
    expectedUser: string | undefined,
    dryRun: boolean,
  ): Promise<PostResultMessage | null> {
    const msg = err instanceof Error ? err.message : String(err);
    const maybeLanded =
      msg.includes('asynchronous response') ||
      msg.includes('message channel closed') ||
      msg.includes('back/forward cache');
    if (dryRun || !maybeLanded) return null;

    log.warn(`${platform}: post 後に channel closed - ${msg.slice(0, 80)}`);
    const capturedUrl = await captureUrl(platform, tabId, text, expectedUser);
    return capturedUrl
      ? { type: 'POST_RESULT', platform, success: true, confirmed: true, url: capturedUrl }
      : unconfirmedPostResult(platform);
  }

  async function ensurePostUrl(
    response: PostResultMessage,
    platform: PlatformId,
    tabId: number,
    text: string,
    expectedUser: string | undefined,
  ): Promise<PostResultMessage> {
    if (response.url) return response;
    const capturedUrl = await captureUrl(platform, tabId, text, expectedUser);
    return capturedUrl ? { ...response, url: capturedUrl } : response;
  }

  async function captureUrl(
    platform: PlatformId,
    tabId: number,
    text: string,
    expectedUser: string | undefined,
  ): Promise<string | undefined> {
    return await capturePostUrlFromTabWithRetry({
      platform,
      tabId,
      text,
      expectedUser,
      onDebug: (message) => options.appendBackgroundLog?.(message),
    }).catch((e) => {
      log.warn(`${platform}: post URL capture failed: ${e instanceof Error ? e.message : String(e)}`);
      return undefined;
    });
  }

  return { postToPlatform };
}

export function buildReplyOverrideUrl(
  platform: PlatformId,
  chunkIndex: number,
  prevPostUrl: string | undefined,
): string | undefined {
  if (platform !== 'x' || chunkIndex === 0 || !prevPostUrl) return undefined;
  const match = prevPostUrl.match(/\/status\/(\d+)/);
  return match?.[1] ? `https://x.com/intent/post?in_reply_to=${match[1]}` : undefined;
}

function shouldOpenActive(adapter: PlatformAdapter, dryRun: boolean, textChunks?: string[]): boolean {
  const forceForegroundForXThreadPreview =
    adapter.id === 'x' && dryRun && !!textChunks && textChunks.length > 1;
  return adapter.requiresForegroundTab === true || forceForegroundForXThreadPreview;
}

export function buildDomPostAttempts(adapter: PlatformAdapter, autoPost: boolean): DomPostAttempt[] {
  const dryRun = !autoPost;
  const attempts: DomPostAttempt[] = [
    { label: 'default' },
    {
      label: 'fresh foreground compose',
      skipApi: true,
      forceActive: true,
      reuseExistingTab: false,
      loadRetries: 1,
      delayBeforeMs: dryRun ? 250 : 750,
    },
  ];

  if (!adapter.requiresForegroundTab) {
    attempts.push({
      label: 'fresh foreground compose with reload retry',
      skipApi: true,
      forceActive: true,
      reuseExistingTab: false,
      loadRetries: 2,
      delayBeforeMs: 1000,
    });
  }

  return attempts;
}

async function attachVerifyResult(
  result: PostResultMessage,
  platform: PlatformId,
  postUrl: string,
  chunks: readonly string[],
  text: string,
  images?: ImageAttachment[],
): Promise<void> {
  const expectation = {
    text: chunks.length > 1 ? chunks[chunks.length - 1]! : text,
    hasImages: !!images?.some((image) => image.type.startsWith('image/')),
    hasVideo: !!images?.some((image) => image.type.startsWith('video/')),
  };
  try {
    const verify = await runVerify(platform, postUrl, expectation);
    result.verify = {
      verified: verify.verified,
      issues: verify.issues,
    };
    const hardErrors = verify.issues.filter((issue) => issue.severity === 'error');
    if (hardErrors.length > 0) {
      log.warn(`${platform} verify: ${hardErrors.length} error - ${hardErrors[0]!.message}`);
    }
  } catch (e) {
    log.warn(`${platform} verify failed (post 自体は成功): ${e instanceof Error ? e.message : String(e)}`);
  }
}

async function maybeAutoOpenPostUrl(
  url: string,
  verify: PostResultMessage['verify'],
): Promise<void> {
  try {
    const { autoOpenPostUrl } = await getSettings();
    if (autoOpenPostUrl === 'never') return;
    const hasError =
      verify && verify.issues.some((issue) => issue.severity === 'error' || issue.kind === 'verify-error');
    if (autoOpenPostUrl === 'on-issue' && !hasError) return;
    await retryTransientTabAction('auto-open post URL tab', () => (
      browser.tabs.create({ url, active: false })
    ));
    log.info(`auto-open post URL: ${url} (autoOpenPostUrl=${autoOpenPostUrl}, hasError=${!!hasError})`);
  } catch (e) {
    log.warn(`auto-open failed: ${e instanceof Error ? e.message : String(e)}`);
  }
}

function unconfirmedPostResult(platform: PlatformId): PostResultMessage {
  return {
    type: 'POST_RESULT',
    platform,
    success: false,
    uncertain: true,
    error: t('runtimePostUncertain'),
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
