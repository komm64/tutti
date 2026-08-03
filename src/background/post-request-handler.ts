import type {
  PostRequestMessage,
  PostResultMessage,
} from '../messages';
import { getAdapter } from '../adapters/registry';
import { getSettings } from '../storage';
import { splitTextForPlatform } from '../utils/platform-text';
import { OperationTimeoutError, withTimeout } from '../utils/promise-timeout';
import { resolvePlatformPostTimeoutMs } from './content-dispatch';
import { releasePostAttachments, recordHistoryEntry } from './history-recorder';
import { maybeCompressVideoForBudget } from './media-preprocess';
import type { OpenedTabRegistry } from './opened-tab-registry';
import type { createPlatformPoster } from './platform-poster';
import {
  normalizePostEvidence,
  shouldRunPostCompletionSideEffects,
  withPostImplementationDiagnostics,
  withPostTiming,
} from './post-result-policy';
import { runPostScheduler } from './post-scheduler';
import { isAmbiguousPostDispatchError } from './post-confirmation';
import { resolveCredentialBackedApiPlatforms } from './platform-strategies';
import {
  clearBadge,
  clearVideoPostingFocusLost,
  notifyResults,
  notifyVideoPostingFocusLost,
} from './post-status-ui';
import { createPostingWindowSession } from './posting-window';
import type { createPostingStateManager } from './posting-state';
import { executeGuardedSubmission } from './submission-execution';
import { withServiceWorkerKeepAlive } from './service-worker-keepalive';
import type {
  createSubmissionGuard,
  SubmissionGuardReservation,
} from './submission-guard';

type PostingStateManager = ReturnType<typeof createPostingStateManager>;
type PlatformPoster = ReturnType<typeof createPlatformPoster>;
type SubmissionGuard = ReturnType<typeof createSubmissionGuard>;

export interface PostRequestHandlerOptions {
  submissionGuard: SubmissionGuard;
  openedTabs: OpenedTabRegistry;
  postingState: PostingStateManager;
  platformPoster: PlatformPoster;
  appendBackgroundLog(message: string): void;
  sendRuntimeMessage(message: unknown): Promise<unknown>;
}

export function createPostRequestHandler(options: PostRequestHandlerOptions) {
  const {
    submissionGuard,
    openedTabs,
    postingState,
    platformPoster,
    appendBackgroundLog,
    sendRuntimeMessage,
  } = options;

  function recordPlatformProgress(result: PostResultMessage): void {
    // background 側の state を更新 (popup 再 open 時に GET_BG_STATE で復元される)
    postingState.recordResult(result);
    // popup へストリーム配信。閉じていれば state から復元するので送信失敗は無視。
    void sendRuntimeMessage({ type: 'PLATFORM_PROGRESS', result }).catch(() => {});
  }

  return async function handlePostRequest(
    request: PostRequestMessage,
  ): Promise<PostResultMessage[]> {
    let adjustedImages: PostRequestMessage['images'];
    let postingStateStarted = false;
    let autoPost = false;
    const annotateImplementation = (result: PostResultMessage): PostResultMessage =>
      withPostImplementationDiagnostics(result, 'next');
    return await withServiceWorkerKeepAlive(() =>
      executeGuardedSubmission<SubmissionGuardReservation, PostResultMessage[]>({
      reserve: async () => {
        const settings = await getSettings();
        autoPost = request.autoPost ?? settings.autoPost;
        return await submissionGuard.reserve({
          requestId: request.requestId,
          intent: request.intent,
          text: request.text,
          platforms: request.platforms,
          images: request.images,
          autoPost,
        });
      },
      run: async (reservation) => {
        const platforms = reservation.allowedPlatforms;
        const requestedPlatforms = reservation.decisions.map(({ platform }) => platform);
        const rejectedResults = reservation.rejectedResults.map(annotateImplementation);

        // Guard reservation が確定するまで tab / posting side effect を開始しない。
        // POST_REQUEST ごとに cleanup 所有権を切り、前回 state を完全上書きする。
        openedTabs.clear();
        postingState.start(request.requestId, requestedPlatforms);
        postingStateStarted = true;
        for (const rejected of rejectedResults) {
          const guard = rejected.submissionGuard;
          appendBackgroundLog(
            `SubmissionGuard decision=${guard?.decision ?? 'indeterminate'} ` +
            `reason=${guard?.reason ?? 'unknown'} requestId=${request.requestId} ` +
            `platform=${rejected.platform}`,
          );
          recordPlatformProgress(rejected);
        }

        if (platforms.length === 0) {
          clearBadge();
          openedTabs.clear();
          return rejectedResults;
        }

        const requestHasVideo = request.images?.some(
          (image) => image.type.startsWith('video/'),
        ) === true;
        const apiPlatforms = autoPost
          ? await resolveCredentialBackedApiPlatforms(platforms)
          : [];
        const apiPlatformSet = new Set(apiPlatforms);
        const foregroundVideoWindow = autoPost && requestHasVideo &&
          platforms.some((platform) => !apiPlatformSet.has(platform));
        const postingWindow = createPostingWindowSession({
          focusMode: foregroundVideoWindow ? 'foreground-video' : 'background',
          initialUrl: foregroundVideoWindow
            ? browser.runtime.getURL('/posting-wait.html')
            : undefined,
          onFocusLost: foregroundVideoWindow
            ? notifyVideoPostingFocusLost
            : undefined,
          onFocusRestored: foregroundVideoWindow
            ? clearVideoPostingFocusLost
            : undefined,
        });
        try {
          // The foreground transition is deliberately the first visible side
          // effect. Video conversion and every DOM posting step happen after
          // this window is already in front, so Tutti never surprises the user
          // by stealing focus midway through the request.
          if (foregroundVideoWindow) {
            clearVideoPostingFocusLost();
            await postingWindow.getOrCreateWindowId();
          }

          // 投稿前に動画を安全な MP4/H.264/AAC へ正規化し、必要に応じて
          // size/trim/letterbox も同じ経路で処理する。
          adjustedImages = await maybeCompressVideoForBudget(
            platforms,
            request.images,
            request.trimVideoToSeconds,
            {
              onConversionFinished: () => {
                postingState.setCompression(null);
              },
            },
          );
          const hasVideo = adjustedImages?.some(
            (image) => image.type.startsWith('video/'),
          ) === true;
          const schedulerStartedAt = Date.now();
          const executionResults = await runPostScheduler({
            platforms,
            autoPost,
            planOptions: {
              hasVideo,
              apiPlatforms,
            },
            post: async (platform, execution) => {
              const platformStartedAt = Date.now();
              const adapter = getAdapter(platform);
              const chunkCount = adapter
                ? splitTextForPlatform(platform, request.text, adapter.charLimit).length
                : 1;
              const platformTimeoutMs = resolvePlatformPostTimeoutMs(
                adjustedImages,
                chunkCount,
              );
              let rawResult: PostResultMessage;
              try {
                rawResult = await withTimeout((async () => {
                  const postWindowId = autoPost && execution.transportPolicy !== 'api-only'
                    ? await postingWindow.getOrCreateWindowId()
                    : undefined;
                  const postWindowFocusReturnId = typeof postWindowId === 'number'
                    ? postingWindow.getFocusReturnWindowId()
                    : undefined;
                  const postOutcome = platformPoster.postToPlatform(
                    platform,
                    request.text,
                    adjustedImages,
                    request.cw,
                    request.visibility,
                    autoPost,
                    {
                      forceForeground: execution.forceForeground,
                      forceBackground: execution.forceBackground,
                      transportPolicy: execution.transportPolicy,
                      postWindowId,
                      postWindowFocusReturnId,
                    },
                  ).then(
                    (value) => ({ kind: 'result' as const, value }),
                    (error: unknown) => ({ kind: 'error' as const, error }),
                  );
                  const outcome = typeof postWindowId === 'number'
                    ? await Promise.race([
                        postOutcome,
                        postingWindow.waitForUnexpectedClose(postWindowId).then(() => ({
                          kind: 'window-closed' as const,
                        })),
                      ])
                    : await postOutcome;
                  if (outcome.kind === 'error') throw outcome.error;
                  return outcome.kind === 'window-closed'
                    ? {
                        type: 'POST_RESULT' as const,
                        platform,
                        success: false,
                        uncertain: true,
                        userAction: 'check-post-before-retry' as const,
                        flow: {
                          mode: 'post' as const,
                          submitReached: true,
                          failedStep: 'posting-window-closed',
                        },
                        error:
                          'The Tutti posting window was closed before the post ' +
                          'could be confirmed. Check the SNS before retrying.',
                      }
                    : outcome.value;
                })(), platformTimeoutMs, (
                  `${platform} post (${chunkCount} chunk${chunkCount === 1 ? '' : 's'})`
                ));
              } catch (error) {
                const timedOut = error instanceof OperationTimeoutError;
                const ambiguous = autoPost && (timedOut || isAmbiguousPostDispatchError(error));
                const message = error instanceof Error ? error.message : String(error);
                appendBackgroundLog(
                  `${platform}: isolated platform failure; continuing remaining posts: ${message}`,
                );
                rawResult = {
                  type: 'POST_RESULT',
                  platform,
                  success: false,
                  uncertain: ambiguous || undefined,
                  userAction: ambiguous ? 'check-post-before-retry' : undefined,
                  flow: {
                    mode: autoPost ? 'post' : 'preview',
                    submitReached: ambiguous,
                    failedStep: timedOut ? 'platform-timeout' : 'platform-exception',
                  },
                  error: message,
                };
              }
              let result = annotateImplementation(
                normalizePostEvidence(rawResult),
              );
              const completedAt = Date.now();
              result = withPostTiming(result, {
                step: `scheduler-queue:${execution.lane}`,
                durationMs: Math.max(0, platformStartedAt - schedulerStartedAt),
                outcome: 'completed',
              });
              result = withPostTiming(result, {
                step: 'platform-total',
                durationMs: Math.max(0, completedAt - platformStartedAt),
                outcome: result.success ? 'completed' : 'failed',
              }, Math.max(0, completedAt - schedulerStartedAt));
              return result;
            },
            onResult: recordPlatformProgress,
          });
          const results = [...rejectedResults, ...executionResults];

          if (shouldRunPostCompletionSideEffects(autoPost, executionResults)) {
            notifyResults(results);
            await recordHistoryEntry(request.text, results, adjustedImages, {
              bodyHash: reservation.fingerprint,
            });
            await openedTabs.cleanup(results);
          } else {
            clearBadge();
            openedTabs.clear();
          }
          return results;
        } finally {
          await postingWindow.releaseBootstrapTab();
        }
      },
      cleanup: async () => {
        // 元 dataRef と圧縮結果 dataRef の双方を、失敗経路も含めて必ず解放する。
        await releasePostAttachments(request.images, adjustedImages);
        if (postingStateStarted) postingState.markDone();
      },
      }),
    );
  };
}
