import type {
  ImageAttachment,
  PlatformId,
  PostFlowTrace,
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
import { closeTabSafely, openOrFocusTab } from './tab-management';
import { tryApiPath } from './api-posting';
import { capturePostUrlFromTabWithRetry } from './post-url-capture';
import {
  buildLoginRedirectErrorForUrl,
  buildMissingReceiverLoginError,
  isMissingReceiverError,
  sendPostMessageWhenReady,
} from './content-dispatch';
import { resolveAdapter } from './adapter-resolver';
import { prepareMediaForPlatform } from './platform-media';
import { maybeResizeImagesForPlatform } from './media-preprocess';
import { downgradeHardVerifyFailures, toPreviewResult } from './post-result-policy';
import type { OpenedTabRegistry } from './opened-tab-registry';
import { retryTransientTabAction } from './tab-action-retry';
import { continuationNeedsReplyUrl } from '../utils/reply-compose';
import type { VerifyExpectation } from '../utils/post-verify';

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
  openedTabs: Pick<OpenedTabRegistry, 'record' | 'forget'>;
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
        flow: {
          mode: autoPost ? 'post' : 'preview',
          submitReached: false,
          failedStep: 'preflight:adapter',
        },
        error: t('runtimeUnsupportedPlatform'),
      };
    }

    const media = await prepareMediaForPlatform(adapter, platform, images, autoPost);
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
    let finalChunkFlow: PostResultMessage['flow'];
    for (let i = 0; i < chunks.length; i++) {
      if (i > 0) await sleep(CHUNK_INTERVAL_MS);
      const chunkImages = i === 0 ? images : undefined;
      const replyToUrl = i > 0 ? prevPostUrl : undefined;
      if (autoPost && i > 0 && continuationNeedsReplyUrl(adapter.id) && !replyToUrl) {
        return unconfirmedPostResult(adapter.id, {
          mode: 'post',
          submitReached: true,
          failedStep: 'capture-url',
          lastCompletedStep: finalChunkFlow?.lastCompletedStep,
        });
      }
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
          replyToUrl,
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
        finalChunkFlow = result.flow;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          type: 'POST_RESULT',
          platform,
          success: false,
          flow: {
            mode: autoPost ? 'post' : 'preview',
            submitReached: false,
            failedStep: 'pre-submit-attempt',
          },
          error: chunks.length > 1 ? t('runtimeChunkFailed', i + 1, chunks.length, msg) : msg,
        };
      }
    }

    const finalResultBase = buildFinalChunkResult(platform, autoPost, allConfirmed, prevPostUrl, finalChunkFlow);
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
    replyToUrl?: string,
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
          replyToUrl,
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
    replyToUrl?: string,
  ): Promise<PostResultMessage> {
    const images = rawImages ? await maybeResizeImagesForPlatform(adapter, rawImages) : undefined;
    const baseFlow: Partial<PostFlowTrace> = {
      mode: autoPost ? 'post' : 'preview',
      attempt: attempt.label,
      submitReached: false,
      lastCompletedStep: 'preflight',
    };

    const canUseApiWithReplyUrl = adapter.id === 'mastodon' && !!replyToUrl;
    if (autoPost && (!overrideUrl || canUseApiWithReplyUrl) && !textChunks && !attempt.skipApi) {
      const apiResult = await tryApiPath(adapter.id, text, images, cw, visibility, replyToUrl);
      if (apiResult === 'no-credentials') {
        // Fall through to DOM path.
      } else if (apiResult.success) {
        if (!apiResult.postUrl) {
          log.warn(`${adapter.id} via API: create response succeeded but no post URL was returned`);
          return unconfirmedPostResult(adapter.id, {
            ...baseFlow,
            submitReached: true,
            lastCompletedStep: 'api-create-post',
            failedStep: 'capture-url',
          });
        }
        log.info(`${adapter.id} via API ✓ ${apiResult.postUrl ?? ''}`);
        return withFlow({
          type: 'POST_RESULT',
          platform: adapter.id,
          success: true,
          confirmed: true,
          url: apiResult.postUrl,
        }, {
          ...baseFlow,
          submitReached: true,
          lastCompletedStep: 'api-create-post',
        });
      } else if (apiResult.uncertain) {
        log.warn(`${adapter.id} via API: post result uncertain - ${apiResult.error ?? t('runtimeUnknownError')}`);
        return unconfirmedPostResult(adapter.id, {
          ...baseFlow,
          submitReached: true,
          lastCompletedStep: 'api-create-post',
          failedStep: 'capture-url',
        });
      } else {
        log.warn(`${adapter.id} via API failed before a confirmed post; falling back to DOM path: ${apiResult.error ?? t('runtimeUnknownError')}`);
      }
    }

    const dryRun = !autoPost;
    const active = attempt.forceActive === true || shouldOpenActive(adapter, dryRun, textChunks, autoPost);
    const reuseExistingTab = shouldReuseExistingTabForAttempt(adapter, autoPost, attempt);
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
        // Foreground-only upload wizards are stateful enough that preview also needs
        // a clean compose surface between repeated runs.
        reuseExistingTab,
      },
    );
    if (typeof tab.id !== 'number') {
      throw new Error(t('runtimeSnsTabOpenFailed'));
    }
    const ownedTabId = wasCreated && !dryRun ? tab.id : undefined;
    if (typeof ownedTabId === 'number') options.openedTabs.record(adapter.id, ownedTabId);
    let response: PostResultMessage | undefined;

    try {
      const currentTab = await browser.tabs.get(tab.id).catch(() => tab);
      const tabUrlBefore = currentTab.url ?? currentTab.pendingUrl;
      const loginRedirectError = buildLoginRedirectErrorForUrl(currentTab.url ?? currentTab.pendingUrl ?? '');
      if (loginRedirectError) {
        return withFlow({
          type: 'POST_RESULT',
          platform: adapter.id,
          success: false,
          userAction: 'sign-in',
          error: loginRedirectError,
        }, {
          ...baseFlow,
          tabUrlBefore,
          failedStep: 'verify-login',
        });
      }

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

      const dispatchStartedAt = Date.now();
      try {
        response = await sendPostMessageWhenReady(tab.id, message);
      } catch (err) {
        if (isMissingReceiverError(err)) {
          const loginError = await buildMissingReceiverLoginError(tab.id, adapter.id);
          if (loginError) {
            return {
              type: 'POST_RESULT',
              platform: adapter.id,
              success: false,
              userAction: 'sign-in',
              flow: {
                ...baseFlow,
                tabUrlBefore,
                failedStep: 'verify-login',
                submitReached: false,
              },
              error: loginError,
            };
          }
        }
        const recovered = await recoverFromMaybeLandedChannelClose(err, adapter.id, tab.id, text, expectedUser, dryRun, dispatchStartedAt);
        if (recovered) return withFlow(recovered, { ...baseFlow, tabUrlBefore });
        throw err;
      }

      if (!response) {
        throw new Error(t('runtimeSnsPageNoResponse'));
      }
      response = withFlow(response, { ...baseFlow, tabUrlBefore });
      if (!response.success) {
        if (response.uncertain) return response;
        throw new Error(response.error ?? t('runtimePostFailed'));
      }
      if (dryRun) return toPreviewResult(response);

      const withUrl = await ensurePostUrl(response, adapter.id, tab.id, text, expectedUser);
      if (withUrl.url) return { ...withUrl, confirmed: true };
      return unconfirmedPostResult(adapter.id, {
        ...withUrl.flow,
        tabUrlBefore,
        failedStep: withUrl.flow?.failedStep ?? 'capture-url',
        submitReached: withUrl.flow?.submitReached ?? true,
      });
    } catch (err) {
      if (typeof ownedTabId === 'number' && response?.flow?.submitReached !== true) {
        await closeOwnedAttemptTab(adapter.id, ownedTabId, attempt.label);
      }
      throw err;
    }
  }

  async function closeOwnedAttemptTab(
    platform: PlatformId,
    tabId: number,
    attemptLabel: string,
  ): Promise<void> {
    log.info(`${platform}: closing failed pre-submit attempt tab (${attemptLabel}, tabId=${tabId}) before retry`);
    options.openedTabs.forget(platform, tabId);
    await closeTabSafely(tabId);
  }

  async function recoverFromMaybeLandedChannelClose(
    err: unknown,
    platform: PlatformId,
    tabId: number,
    text: string,
    expectedUser: string | undefined,
    dryRun: boolean,
    minCapturedAt?: number,
  ): Promise<PostResultMessage | null> {
    const msg = err instanceof Error ? err.message : String(err);
    const maybeLanded =
      msg.includes('asynchronous response') ||
      msg.includes('message channel closed') ||
      msg.includes('back/forward cache');
    if (dryRun || !maybeLanded) return null;

    log.warn(`${platform}: post 後に channel closed - ${msg.slice(0, 80)}`);
    const captured = await captureUrl(platform, tabId, text, expectedUser, minCapturedAt);
    return captured.url
      ? withFlow({ type: 'POST_RESULT', platform, success: true, confirmed: true, url: captured.url }, {
          mode: dryRun ? 'preview' : 'post',
          submitReached: true,
          lastCompletedStep: 'capture-url',
          urlCaptureTrace: captured.trace,
        })
      : unconfirmedPostResult(platform, {
          mode: dryRun ? 'preview' : 'post',
          submitReached: true,
          failedStep: 'capture-url',
          urlCaptureTrace: captured.trace,
        });
  }

  async function ensurePostUrl(
    response: PostResultMessage,
    platform: PlatformId,
    tabId: number,
    text: string,
    expectedUser: string | undefined,
  ): Promise<PostResultMessage> {
    if (response.url) return response;
    const captured = await captureUrl(platform, tabId, text, expectedUser, response.flow?.submissionStartedAt);
    const tabUrlAfter = await browser.tabs.get(tabId)
      .then((tab) => tab.url ?? tab.pendingUrl)
      .catch(() => undefined);
    return captured.url
      ? withFlow({ ...response, url: captured.url }, {
          lastCompletedStep: 'capture-url',
          tabUrlAfter,
          urlCaptureTrace: captured.trace,
        })
      : withFlow(response, {
          failedStep: response.flow?.failedStep ?? 'capture-url',
          tabUrlAfter,
          urlCaptureTrace: captured.trace,
        });
  }

  async function captureUrl(
    platform: PlatformId,
    tabId: number,
    text: string,
    expectedUser: string | undefined,
    minCapturedAt?: number,
  ): Promise<{ url?: string; trace: string[] }> {
    const trace: string[] = [];
    const url = await capturePostUrlFromTabWithRetry({
      platform,
      tabId,
      text,
      expectedUser,
      minCapturedAt,
      onDebug: (message) => {
        trace.push(message);
        options.appendBackgroundLog?.(message);
      },
    }).catch((e) => {
      log.warn(`${platform}: post URL capture failed: ${e instanceof Error ? e.message : String(e)}`);
      return undefined;
    });
    return { url, trace };
  }

  return { postToPlatform };
}

export function buildReplyOverrideUrl(
  platform: PlatformId,
  chunkIndex: number,
  prevPostUrl: string | undefined,
): string | undefined {
  if (chunkIndex === 0 || !prevPostUrl) return undefined;
  if (platform === 'mastodon' || platform === 'threads') return prevPostUrl;
  if (platform !== 'x') return undefined;
  const match = prevPostUrl.match(/\/status\/(\d+)/);
  return match?.[1] ? `https://x.com/intent/post?in_reply_to=${match[1]}` : undefined;
}

export function shouldOpenActive(
  adapter: PlatformAdapter,
  dryRun: boolean,
  textChunks?: string[],
  autoPost = !dryRun,
): boolean {
  if (autoPost) return true;
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

export function shouldReuseExistingTabForAttempt(
  adapter: Pick<PlatformAdapter, 'requiresForegroundTab'>,
  autoPost: boolean,
  attempt: Pick<DomPostAttempt, 'reuseExistingTab'> = {},
): boolean {
  if (typeof attempt.reuseExistingTab === 'boolean') return attempt.reuseExistingTab;
  const dryRun = !autoPost;
  return dryRun && adapter.requiresForegroundTab !== true;
}

export function buildFinalChunkResult(
  platform: PlatformId,
  autoPost: boolean,
  allConfirmed: boolean,
  postUrl?: string,
  flow?: PostResultMessage['flow'],
): PostResultMessage {
  const mode = autoPost ? 'post' : 'preview';
  const lastCompletedStep = flow?.lastCompletedStep ?? (autoPost ? 'post-flow' : 'preview-flow');
  return {
    type: 'POST_RESULT',
    platform,
    success: true,
    confirmed: allConfirmed,
    url: postUrl,
    flow: {
      ...flow,
      mode: flow?.mode ?? mode,
      submitReached: flow?.submitReached ?? autoPost,
      lastCompletedStep,
    },
  };
}

async function attachVerifyResult(
  result: PostResultMessage,
  platform: PlatformId,
  postUrl: string,
  chunks: readonly string[],
  text: string,
  images?: ImageAttachment[],
): Promise<void> {
  const expectation = buildVerifyExpectationForChunk(chunks, text, images, chunks.length - 1);
  try {
    result.flow = {
      ...result.flow,
      submitReached: result.flow?.submitReached ?? true,
      lastCompletedStep: 'verify-post',
    };
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
    result.flow = {
      ...result.flow,
      submitReached: result.flow?.submitReached ?? true,
      failedStep: 'verify-post',
    };
    log.warn(`${platform} verify failed (post 自体は成功): ${e instanceof Error ? e.message : String(e)}`);
  }
}

export function buildVerifyExpectationForChunk(
  chunks: readonly string[],
  text: string,
  images: ImageAttachment[] | undefined,
  chunkIndex: number,
): VerifyExpectation {
  const chunkText = chunks.length > 1 ? chunks[chunkIndex] ?? chunks[chunks.length - 1] ?? text : text;
  const mediaBelongsToThisChunk = chunks.length <= 1 || chunkIndex === 0;
  return {
    text: chunkText,
    hasImages: mediaBelongsToThisChunk && !!images?.some((image) => image.type.startsWith('image/')),
    hasVideo: mediaBelongsToThisChunk && !!images?.some((image) => image.type.startsWith('video/')),
  };
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

function unconfirmedPostResult(platform: PlatformId, flow: Partial<PostFlowTrace> = {}): PostResultMessage {
  return {
    type: 'POST_RESULT',
    platform,
    success: false,
    uncertain: true,
    userAction: 'check-post-before-retry',
    flow: {
      submitReached: true,
      ...flow,
    },
    error: t('runtimePostUncertain'),
  };
}

function withFlow(result: PostResultMessage, flow: Partial<PostFlowTrace>): PostResultMessage {
  return {
    ...result,
    flow: {
      submitReached: result.flow?.submitReached ?? flow.submitReached ?? false,
      ...flow,
      ...result.flow,
      urlCaptureTrace: result.flow?.urlCaptureTrace ?? flow.urlCaptureTrace,
      submissionStartedAt: result.flow?.submissionStartedAt ?? flow.submissionStartedAt,
      tabUrlBefore: result.flow?.tabUrlBefore ?? flow.tabUrlBefore,
      tabUrlAfter: result.flow?.tabUrlAfter ?? flow.tabUrlAfter,
    },
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
