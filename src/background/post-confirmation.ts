import type {
  ImageAttachment,
  PlatformId,
  PostResultMessage,
} from '../messages';
import { getSettings } from '../storage';
import { log } from '../utils/logger';
import type { VerifyExpectation } from '../utils/post-verify';
import {
  buildExpectedUrlsForVerification,
  capturePostUrlFromTabWithRetry,
  runVerify,
} from './platform-strategies';
import { unconfirmedPostResult, withFlow } from './post-result-policy';
import { retryTransientTabAction } from './tab-action-retry';

export interface PostConfirmationOptions {
  appendBackgroundLog?: (message: string) => void;
}

export function createPostConfirmation(options: PostConfirmationOptions = {}) {
  async function recoverFromAmbiguousDispatchFailure(
    error: unknown,
    platform: PlatformId,
    tabId: number,
    text: string,
    expectedUser: string | undefined,
    dryRun: boolean,
    minCapturedAt?: number,
  ): Promise<PostResultMessage | null> {
    if (dryRun || !isAmbiguousPostDispatchError(error)) return null;

    const message = error instanceof Error ? error.message : String(error);
    log.warn(`${platform}: post dispatch result is ambiguous - ${message.slice(0, 80)}`);
    const captured = await captureUrl(
      platform,
      tabId,
      text,
      expectedUser,
      minCapturedAt,
    );
    return captured.url
      ? withFlow({
          type: 'POST_RESULT',
          platform,
          success: true,
          confirmed: true,
          url: captured.url,
        }, {
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
    const captured = await captureUrl(
      platform,
      tabId,
      text,
      expectedUser,
      response.flow?.submissionStartedAt,
    );
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
    }).catch((error) => {
      log.warn(
        `${platform}: post URL capture failed: ` +
        `${error instanceof Error ? error.message : String(error)}`,
      );
      return undefined;
    });
    return { url, trace };
  }

  return {
    ensurePostUrl,
    recoverFromAmbiguousDispatchFailure,
  };
}

export type PostConfirmation = ReturnType<typeof createPostConfirmation>;

export async function attachVerifyResult(
  result: PostResultMessage,
  platform: PlatformId,
  postUrl: string,
  chunks: readonly string[],
  text: string,
  images?: ImageAttachment[],
): Promise<void> {
  const expectation = buildVerifyExpectationForChunk(
    platform,
    chunks,
    text,
    images,
    chunks.length - 1,
  );
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
      log.warn(
        `${platform} verify: ${hardErrors.length} error - ${hardErrors[0]!.message}`,
      );
    }
  } catch (error) {
    result.flow = {
      ...result.flow,
      submitReached: result.flow?.submitReached ?? true,
      failedStep: 'verify-post',
    };
    log.warn(
      `${platform} verify failed (post 自体は成功): ` +
      `${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export function buildVerifyExpectationForChunk(
  platform: PlatformId,
  chunks: readonly string[],
  text: string,
  images: ImageAttachment[] | undefined,
  chunkIndex: number,
): VerifyExpectation {
  const chunkText = chunks.length > 1
    ? chunks[chunkIndex] ?? chunks[chunks.length - 1] ?? text
    : text;
  const mediaBelongsToThisChunk = chunks.length <= 1 || chunkIndex === 0;
  const expectedUrls = buildExpectedUrlsForVerification(platform, chunkText);
  return {
    text: chunkText,
    hasImages: mediaBelongsToThisChunk &&
      !!images?.some((image) => image.type.startsWith('image/')),
    hasVideo: mediaBelongsToThisChunk &&
      !!images?.some((image) => image.type.startsWith('video/')),
    ...(expectedUrls.length > 0 ? { expectedUrls } : {}),
  };
}

export function isAmbiguousPostDispatchError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes('asynchronous response') ||
    message.includes('message channel closed') ||
    message.includes('message port closed') ||
    message.includes('back/forward cache') ||
    message.includes('content script response timed out')
  );
}

export async function maybeAutoOpenPostUrl(
  url: string,
  verify: PostResultMessage['verify'],
): Promise<void> {
  try {
    const { autoOpenPostUrl } = await getSettings();
    if (autoOpenPostUrl === 'never') return;
    const hasError = verify && verify.issues.some(
      (issue) => issue.severity === 'error' || issue.kind === 'verify-error',
    );
    if (autoOpenPostUrl === 'on-issue' && !hasError) return;
    await retryTransientTabAction('auto-open post URL tab', () => (
      browser.tabs.create({ url, active: false })
    ));
    log.info(
      `auto-open post URL: ${url} ` +
      `(autoOpenPostUrl=${autoOpenPostUrl}, hasError=${!!hasError})`,
    );
  } catch (error) {
    log.warn(
      `auto-open failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
