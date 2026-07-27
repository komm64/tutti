import type {
  ImageAttachment,
  PlatformId,
  PostFlowTrace,
  PostResultMessage,
  PostToPlatformMessage,
} from '../messages';
import type { PlatformAdapter } from '../adapters/types';
import type { ApiPostResult } from '../api/types';
import { getLastSeenUsers } from '../storage';
import { splitTextForPlatform } from '../utils/platform-text';
import { log } from '../utils/logger';
import { t } from '../utils/i18n';
import {
  closeTabSafely,
  openOrFocusTab,
} from './tab-management';
import {
  buildReplyOverrideUrl,
  canUseApiWithReplyUrl,
  continuationNeedsReplyUrl,
  isVerifySupported,
  resolveComposeUrlForMedia,
  shouldUseInlineThread,
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
import {
  buildFinalChunkResult,
  downgradeHardVerifyFailures,
  toPreviewResult,
  unconfirmedPostResult,
  withFlow,
} from './post-result-policy';
import type { OpenedTabRegistry } from './opened-tab-registry';
import {
  buildDomPostAttempts,
  type DomPostAttempt,
  resolvePreSubmitLoadOptions,
  shouldOpenActive,
  shouldRetryPostAttempt,
  shouldReuseExistingTabForAttempt,
} from './dom-attempt-policy';
import {
  attachVerifyResult,
  createPostConfirmation,
  maybeAutoOpenPostUrl,
} from './post-confirmation';

const CHUNK_INTERVAL_MS = 2000;

type Visibility = 'public' | 'unlisted' | 'private' | 'direct';

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
  const confirmation = createPostConfirmation({
    appendBackgroundLog: options.appendBackgroundLog,
  });

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

    if (shouldUseInlineThread(adapter.id, autoPost) && chunks.length > 1) {
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

    if (
      autoPost
      && (!overrideUrl || canUseApiWithReplyUrl(adapter.id, replyToUrl))
      && !textChunks
      && !attempt.skipApi
    ) {
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
        const recovered = await confirmation.recoverFromAmbiguousDispatchFailure(
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

      const withUrl = await confirmation.ensurePostUrl(
        response,
        adapter.id,
        tab.id,
        text,
        expectedUser,
      );
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

export function getComposeUrlForMedia(
  adapter: PlatformAdapter,
  text: string,
  images?: readonly ImageAttachment[],
): string {
  return resolveComposeUrlForMedia(adapter.id, adapter.getComposeUrl(text), images);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
