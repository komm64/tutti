import type { PlatformAdapter } from '../adapters/types';
import type { ApiPostResult } from '../api/types';
import type {
  ImageAttachment,
  PlatformId,
  PostFlowTrace,
  PostResultMessage,
  PostToPlatformMessage,
} from '../messages';
import { getLastSeenUsers } from '../storage';
import { t } from '../utils/i18n';
import { log } from '../utils/logger';
import {
  buildLoginRedirectErrorForUrl,
  buildMissingReceiverLoginError,
  isMissingReceiverError,
  sendPostMessageWhenReady,
} from './content-dispatch';
import {
  buildDomPostAttempts,
  type DomPostAttempt,
  resolvePreSubmitLoadOptions,
  shouldOpenActive,
  shouldRetryPostAttempt,
  shouldReuseExistingTabForAttempt,
} from './dom-attempt-policy';
import { maybeResizeImagesForPlatform } from './media-preprocess';
import type { OpenedTabRegistry } from './opened-tab-registry';
import type { PostConfirmation } from './post-confirmation';
import {
  canUseApiWithReplyUrl,
  resolveComposeUrlForMedia,
  tryApiPath,
} from './platform-strategies';
import {
  toPreviewResult,
  unconfirmedPostResult,
  withFlow,
} from './post-result-policy';
import { closeTabSafely, openOrFocusTab } from './tab-management';
import type {
  PostExecutionOptions,
  PostingVisibility,
} from './posting-orchestrator-contract';

export type Visibility = PostingVisibility;
export type PostToPlatformOptions = PostExecutionOptions;

export interface PostingTransportOptions {
  openedTabs: Pick<OpenedTabRegistry, 'record' | 'forget'>;
  confirmation: Pick<
    PostConfirmation,
    | 'preparePostUrlCapture'
    | 'ensurePostUrl'
    | 'recoverFromAmbiguousDispatchFailure'
  >;
}

export class PostFlowError extends Error {
  constructor(message: string, readonly flow?: PostFlowTrace) {
    super(message);
    this.name = 'PostFlowError';
  }
}

export function createPostingTransport(options: PostingTransportOptions) {
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
    const attempts = buildDomPostAttempts(
      adapter,
      autoPost,
      postOptions.forceForeground === true,
      postOptions.forceBackground === true,
    );
    let lastError: unknown;
    for (let index = 0; index < attempts.length; index += 1) {
      const attempt = attempts[index]!;
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
      } catch (error) {
        lastError = error;
        const flow = error instanceof PostFlowError ? error.flow : undefined;
        if (!shouldRetryPostAttempt(autoPost, flow)) {
          const message = error instanceof Error ? error.message : String(error);
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
        if (rawImages?.length && adapter.mediaRetryPolicy === 'single-attempt') {
          log.warn(
            `${adapter.id}: media attempt "${attempt.label}" failed ` +
            'before submit; skipping a fresh upload attempt',
          );
          throw error;
        }
        if (index >= attempts.length - 1) throw error;
        const next = attempts[index + 1]!;
        log.warn(
          `${adapter.id}: pre-submit attempt "${attempt.label}" failed before the post action; ` +
          `retrying with "${next.label}": ` +
          `${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
    throw lastError instanceof Error
      ? lastError
      : new Error(String(lastError ?? t('runtimeUnknownError')));
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
    const images = rawImages
      ? await maybeResizeImagesForPlatform(adapter, rawImages)
      : undefined;
    const baseFlow: Partial<PostFlowTrace> = {
      mode: autoPost ? 'post' : 'preview',
      attempt: attempt.label,
      submitReached: false,
      lastCompletedStep: 'preflight',
    };

    if (
      autoPost &&
      (!overrideUrl || canUseApiWithReplyUrl(adapter.id, replyToUrl)) &&
      !textChunks &&
      !attempt.skipApi &&
      postOptions.transportPolicy !== 'dom-only'
    ) {
      const apiResult = await tryApiPath(
        adapter.id,
        text,
        images,
        cw,
        visibility,
        replyToUrl,
      );
      const apiOutcome = resolveApiPostOutcome(
        adapter.id,
        apiResult,
        baseFlow,
        postOptions.transportPolicy === 'api-only',
      );
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

    if (postOptions.transportPolicy === 'api-only') {
      return apiTransportUnavailableResult(adapter.id, baseFlow);
    }

    const dryRun = !autoPost;
    const forceForeground = postOptions.forceForeground === true;
    const forceBackground = postOptions.forceBackground === true;
    if (forceForeground && forceBackground) {
      throw new Error('Conflicting post tab activation policy');
    }
    const active = !forceBackground && (
      forceForeground || attempt.forceActive === true ||
      shouldOpenActive(adapter, dryRun, textChunks, autoPost)
    );
    const reuseExistingTab = shouldReuseExistingTabForAttempt(
      adapter,
      autoPost,
      attempt,
      forceForeground,
    );
    const openOptions = resolvePreSubmitLoadOptions(adapter);
    const { tab, wasCreated } = await openOrFocusTab(
      overrideUrl ?? getComposeUrlForMedia(adapter, text, images),
      adapter.matchUrl,
      active,
      {
        ...openOptions,
        loadRetries: Math.max(
          openOptions?.loadRetries ?? 0,
          attempt.loadRetries ?? 0,
        ),
        reuseExistingTab,
        targetWindowId: postOptions.postWindowId,
        focusWindow: typeof postOptions.postWindowId !== 'number',
        restoreFocusWindowId: postOptions.postWindowFocusReturnId,
      },
    );
    if (typeof tab.id !== 'number') {
      throw new Error(t('runtimeSnsTabOpenFailed'));
    }
    const createdAttemptTabId = wasCreated ? tab.id : undefined;
    const registeredTabId = !dryRun ? createdAttemptTabId : undefined;
    if (typeof registeredTabId === 'number') {
      options.openedTabs.record(adapter.id, registeredTabId);
    }
    let response: PostResultMessage | undefined;

    try {
      const currentTab = await browser.tabs.get(tab.id).catch(() => tab);
      const tabUrlBefore = currentTab.url ?? currentTab.pendingUrl;
      const loginRedirectError = buildLoginRedirectErrorForUrl(
        currentTab.url ?? currentTab.pendingUrl ?? '',
      );
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
      const captureBaseline = dryRun
        ? undefined
        : await options.confirmation.preparePostUrlCapture(
            adapter.id,
            tab.id,
          );
      const message: PostToPlatformMessage = {
        type: 'POST_TO_PLATFORM',
        platform: adapter.id,
        implementationPath: 'next',
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
      } catch (error) {
        if (isMissingReceiverError(error)) {
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
        const recovered = await options.confirmation
          .recoverFromAmbiguousDispatchFailure(
            error,
            adapter.id,
            tab.id,
            text,
            expectedUser,
            dryRun,
            dispatchStartedAt,
            captureBaseline,
          );
        if (recovered) {
          return withFlow(recovered, { ...baseFlow, tabUrlBefore });
        }
        throw error;
      }

      if (!response) {
        throw new Error(t('runtimeSnsPageNoResponse'));
      }
      response = withFlow(response, { ...baseFlow, tabUrlBefore });
      if (!response.success) {
        if (response.uncertain) return response;
        throw new PostFlowError(
          response.error ?? t('runtimePostFailed'),
          response.flow,
        );
      }
      if (dryRun) return toPreviewResult(response);

      const withUrl = await options.confirmation.ensurePostUrl(
        response,
        adapter.id,
        tab.id,
        text,
        expectedUser,
        captureBaseline,
      );
      if (withUrl.url) return { ...withUrl, confirmed: true };
      return unconfirmedPostResult(adapter.id, {
        ...withUrl.flow,
        tabUrlBefore,
        failedStep: withUrl.flow?.failedStep ?? 'capture-url',
        submitReached: withUrl.flow?.submitReached ?? true,
      });
    } catch (error) {
      const preserveFailedMediaCompose =
        autoPost &&
        rawImages?.length &&
        adapter.mediaRetryPolicy === 'single-attempt';
      if (
        typeof createdAttemptTabId === 'number' &&
        response?.flow?.submitReached !== true &&
        !preserveFailedMediaCompose
      ) {
        // Keep only the successful preview composer. A failed preview retry is
        // still our freshly-created tab; leaving it open can make X process
        // the same video in several tabs at once and strand later attempts.
        await closeOwnedAttemptTab(adapter.id, createdAttemptTabId, attempt.label);
      }
      throw error;
    }
  }

  async function closeOwnedAttemptTab(
    platform: PlatformId,
    tabId: number,
    attemptLabel: string,
  ): Promise<void> {
    log.info(
      `${platform}: closing failed pre-submit attempt tab ` +
      `(${attemptLabel}, tabId=${tabId}) before retry`,
    );
    options.openedTabs.forget(platform, tabId);
    await closeTabSafely(tabId);
  }

  return { postSingleChunkWithRetry };
}

export function resolveApiPostOutcome(
  platform: PlatformId,
  apiResult: ApiPostResult | 'no-credentials',
  baseFlow: Partial<PostFlowTrace> = {},
  requireApi = false,
): PostResultMessage | null {
  if (apiResult === 'no-credentials') {
    return requireApi
      ? apiTransportUnavailableResult(platform, baseFlow)
      : null;
  }
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

function apiTransportUnavailableResult(
  platform: PlatformId,
  baseFlow: Partial<PostFlowTrace>,
): PostResultMessage {
  return withFlow({
    type: 'POST_RESULT',
    platform,
    success: false,
    error:
      'Saved API credentials became unavailable before posting. ' +
      'No DOM fallback was attempted.',
  }, {
    ...baseFlow,
    attempt: 'api',
    submitReached: false,
    failedStep: 'preflight:api-credentials',
  });
}

export function getComposeUrlForMedia(
  adapter: PlatformAdapter,
  text: string,
  images?: readonly ImageAttachment[],
): string {
  return resolveComposeUrlForMedia(
    adapter.id,
    adapter.getComposeUrl(text),
    images,
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
