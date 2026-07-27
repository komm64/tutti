import type {
  ImageAttachment,
  PlatformId,
  PostFlowTrace,
  PostResultMessage,
  PostToPlatformMessage,
} from '../messages';
import type { PlatformAdapter } from '../adapters/types';
import type { ApiPostResult } from '../api/types';
import { getLastSeenUsers, getSettings } from '../storage';
import { splitTextForPlatform } from '../utils/platform-text';
import { log } from '../utils/logger';
import { t } from '../utils/i18n';
import {
  closeTabSafely,
  openOrFocusTab,
  type OpenOrFocusTabOptions,
} from './tab-management';
import {
  buildReplyOverrideUrl,
  capturePostUrlFromTabWithRetry,
  continuationNeedsReplyUrl,
  isVerifySupported,
  runVerify,
  tryApiPath,
} from './platform-strategies';
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
import type { VerifyExpectation } from '../utils/post-verify';
import { extractHttpUrls } from '../utils/text-urls';

const CHUNK_INTERVAL_MS = 2000;

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

export interface PostToPlatformOptions {
  forceForeground?: boolean;
}

class PostFlowError extends Error {
  constructor(message: string, readonly flow?: PostFlowTrace) {
    super(message);
    this.name = 'PostFlowError';
  }
}

export function createPlatformPoster(options: PlatformPosterOptions) {
  async function postToPlatform(
    platform: PlatformId,
    text: string,
    images?: ImageAttachment[],
    cw?: string,
    visibility?: Visibility,
    autoPost = true,
    postOptions: PostToPlatformOptions = {},
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
          postOptions,
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
        const flow = err instanceof PostFlowError ? err.flow : undefined;
        return {
          type: 'POST_RESULT',
          platform,
          success: false,
          flow: {
            mode: autoPost ? 'post' : 'preview',
            submitReached: flow?.submitReached ?? false,
            lastCompletedStep: flow?.lastCompletedStep,
            failedStep: flow?.failedStep ?? 'pre-submit-attempt',
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
    postOptions: PostToPlatformOptions = {},
  ): Promise<PostResultMessage> {
    const attempts = buildDomPostAttempts(adapter, autoPost, postOptions.forceForeground === true);
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
          postOptions,
        );
      } catch (err) {
        lastError = err;
        const flow = err instanceof PostFlowError ? err.flow : undefined;
        if (!shouldRetryPostAttempt(autoPost, flow)) {
          const message = err instanceof Error ? err.message : String(err);
          log.warn(
            `${adapter.id}: post action may have started during "${attempt.label}"; ` +
            'stopping automatic retries',
          );
          return {
            type: 'POST_RESULT',
            platform: adapter.id,
            success: false,
            uncertain: true,
            userAction: 'check-post-before-retry',
            flow: {
              mode: 'post',
              ...flow,
              submitReached: true,
              failedStep: flow?.failedStep ?? 'post-dispatch',
            },
            error: message,
          };
        }
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
    postOptions: PostToPlatformOptions = {},
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
      const apiOutcome = resolveApiPostOutcome(adapter.id, apiResult, baseFlow);
      if (apiOutcome) {
        if (apiOutcome.success) {
          log.info(`${adapter.id} via API ✓ ${apiOutcome.url ?? ''}`);
        } else if (apiOutcome.uncertain) {
          const detail = apiResult === 'no-credentials'
            ? t('runtimeUnknownError')
            : apiResult.error ?? t('runtimeUnknownError');
          log.warn(`${adapter.id} via API: post result uncertain - ${detail}`);
        } else {
          log.warn(
            `${adapter.id} via API failed; keeping this request on the selected API transport: ` +
            `${apiOutcome.error ?? t('runtimeUnknownError')}`,
          );
        }
        return apiOutcome;
      }
    }

    const dryRun = !autoPost;
    const forceForeground = postOptions.forceForeground === true;
    const active = forceForeground || attempt.forceActive === true ||
      shouldOpenActive(adapter, dryRun, textChunks, autoPost);
    const reuseExistingTab = shouldReuseExistingTabForAttempt(adapter, autoPost, attempt, forceForeground);
    const openOptions = resolvePreSubmitLoadOptions(adapter);
    const { tab, wasCreated } = await openOrFocusTab(
      overrideUrl ?? getComposeUrlForMedia(adapter, text, images),
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
        const recovered = await recoverFromAmbiguousDispatchFailure(
          err,
          adapter.id,
          tab.id,
          text,
          expectedUser,
          dryRun,
          dispatchStartedAt,
        );
        if (recovered) return withFlow(recovered, { ...baseFlow, tabUrlBefore });
        throw err;
      }

      if (!response) {
        throw new Error(t('runtimeSnsPageNoResponse'));
      }
      response = withFlow(response, { ...baseFlow, tabUrlBefore });
      if (!response.success) {
        if (response.uncertain) return response;
        throw new PostFlowError(response.error ?? t('runtimePostFailed'), response.flow);
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

  async function recoverFromAmbiguousDispatchFailure(
    err: unknown,
    platform: PlatformId,
    tabId: number,
    text: string,
    expectedUser: string | undefined,
    dryRun: boolean,
    minCapturedAt?: number,
  ): Promise<PostResultMessage | null> {
    if (dryRun || !isAmbiguousPostDispatchError(err)) return null;

    const msg = err instanceof Error ? err.message : String(err);
    log.warn(`${platform}: post dispatch result is ambiguous - ${msg.slice(0, 80)}`);
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

export function resolveApiPostOutcome(
  platform: PlatformId,
  apiResult: ApiPostResult | 'no-credentials',
  baseFlow: Partial<PostFlowTrace> = {},
): PostResultMessage | null {
  if (apiResult === 'no-credentials') return null;
  const flow = {
    ...baseFlow,
    attempt: 'api',
  };
  if (apiResult.success && apiResult.postUrl) {
    return withFlow({
      type: 'POST_RESULT',
      platform,
      success: true,
      confirmed: true,
      url: apiResult.postUrl,
    }, {
      ...flow,
      submitReached: true,
      lastCompletedStep: 'api-create-post',
    });
  }
  if (apiResult.success || apiResult.uncertain) {
    return unconfirmedPostResult(platform, {
      ...flow,
      submitReached: true,
      lastCompletedStep: 'api-create-post',
      failedStep: 'capture-url',
    });
  }
  return withFlow({
    type: 'POST_RESULT',
    platform,
    success: false,
    error: apiResult.error ?? t('runtimeUnknownError'),
  }, {
    ...flow,
    submitReached: false,
    failedStep: 'api-post',
  });
}

export function shouldRetryPostAttempt(
  autoPost: boolean,
  flow?: Pick<PostFlowTrace, 'submitReached'>,
): boolean {
  return !autoPost || flow?.submitReached !== true;
}

export function isAmbiguousPostDispatchError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return (
    message.includes('asynchronous response') ||
    message.includes('message channel closed') ||
    message.includes('message port closed') ||
    message.includes('back/forward cache') ||
    message.includes('content script response timed out')
  );
}

export function getComposeUrlForMedia(
  adapter: PlatformAdapter,
  text: string,
  images?: readonly ImageAttachment[],
): string {
  const hasVideo = images?.some((image) => image.type.startsWith('video/')) === true;
  if (adapter.id === 'tumblr' && hasVideo) return 'https://www.tumblr.com/new/video';
  return adapter.getComposeUrl(text);
}

export function resolvePreSubmitLoadOptions(
  adapter: Pick<PlatformAdapter, 'preSubmitLoad'>,
): OpenOrFocusTabOptions | undefined {
  const policy = adapter.preSubmitLoad;
  if (!policy) return undefined;
  return {
    loadRetries: policy.retryCount,
    relaxedComposeUrlReady: policy.urlReady === 'same-origin-path',
  };
}

export function shouldOpenActive(
  adapter: PlatformAdapter,
  dryRun: boolean,
  textChunks?: string[],
  autoPost = !dryRun,
  forceForeground = false,
): boolean {
  if (forceForeground) return true;
  if (autoPost) return true;
  const forceForegroundForXThreadPreview =
    adapter.id === 'x' && dryRun && !!textChunks && textChunks.length > 1;
  return adapter.requiresForegroundTab === true || forceForegroundForXThreadPreview;
}

export function buildDomPostAttempts(
  adapter: PlatformAdapter,
  autoPost: boolean,
  forceForeground = false,
): DomPostAttempt[] {
  const dryRun = !autoPost;
  const attempts: DomPostAttempt[] = [
    forceForeground ? { label: 'default', forceActive: true } : { label: 'default' },
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
  forceForeground = false,
): boolean {
  if (typeof attempt.reuseExistingTab === 'boolean') return attempt.reuseExistingTab;
  const dryRun = !autoPost;
  return dryRun && adapter.requiresForegroundTab !== true && !forceForeground;
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
  const expectation = buildVerifyExpectationForChunk(platform, chunks, text, images, chunks.length - 1);
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
  platform: PlatformId,
  chunks: readonly string[],
  text: string,
  images: ImageAttachment[] | undefined,
  chunkIndex: number,
): VerifyExpectation {
  const chunkText = chunks.length > 1 ? chunks[chunkIndex] ?? chunks[chunks.length - 1] ?? text : text;
  const mediaBelongsToThisChunk = chunks.length <= 1 || chunkIndex === 0;
  const expectedUrls = platform === 'tumblr' ? extractHttpUrls(chunkText) : [];
  return {
    text: chunkText,
    hasImages: mediaBelongsToThisChunk && !!images?.some((image) => image.type.startsWith('image/')),
    hasVideo: mediaBelongsToThisChunk && !!images?.some((image) => image.type.startsWith('video/')),
    ...(expectedUrls.length > 0 ? { expectedUrls } : {}),
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
