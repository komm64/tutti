import type {
  PlatformId,
  PostFlowTrace,
  PostImplementationPath,
  PostResultMessage,
} from '../messages';
import { t } from '../utils/i18n';

export const CURRENT_POST_IMPLEMENTATION = {
  revision: 1,
  path: 'next',
} as const;

export function withPostImplementationDiagnostics(
  result: PostResultMessage,
  path: PostImplementationPath = 'next',
): PostResultMessage {
  return {
    ...result,
    implementation: {
      revision: CURRENT_POST_IMPLEMENTATION.revision,
      path,
    },
  };
}

export function toPreviewResult(result: PostResultMessage): PostResultMessage {
  const { url: _url, verify: _verify, confirmed: _confirmed, ...rest } = result;
  return {
    ...rest,
    preview: true,
  };
}

export function postedResults(results: readonly PostResultMessage[]): PostResultMessage[] {
  return results.filter(hasDurablePostEvidence);
}

export function realPostResults(results: readonly PostResultMessage[]): PostResultMessage[] {
  return results.filter((result) => !result.preview);
}

export function normalizePostEvidence(result: PostResultMessage): PostResultMessage {
  if (result.preview || !result.success) return result;
  if (result.success && result.url && result.confirmed !== true) {
    return { ...result, confirmed: true };
  }
  if (result.success && !hasDurablePostEvidence(result)) {
    return {
      ...result,
      success: false,
      confirmed: false,
      uncertain: true,
      userAction: result.userAction ?? 'check-post-before-retry',
      flow: {
        submitReached: result.flow?.submitReached ?? true,
        ...result.flow,
        failedStep: result.flow?.failedStep ?? 'capture-url',
      },
      error: result.error ?? t('runtimePostUncertain'),
    };
  }
  return result;
}

export function hasDurablePostEvidence(result: PostResultMessage): boolean {
  return result.success === true && result.preview !== true && !!result.url;
}

export function downgradeHardVerifyFailures(result: PostResultMessage): PostResultMessage {
  if (!result.success) return result;
  const hardIssue = result.verify?.issues.find((issue) => issue.severity === 'error');
  if (!hardIssue) return result;
  return {
    ...result,
    success: false,
    confirmed: false,
    uncertain: true,
    userAction: result.userAction ?? 'check-post-before-retry',
    flow: {
      submitReached: result.flow?.submitReached ?? true,
      ...result.flow,
      failedStep: result.flow?.failedStep ?? hardIssue.kind,
    },
    error: hardIssue.message,
  };
}

export function buildFinalChunkResult(
  platform: PlatformId,
  autoPost: boolean,
  allConfirmed: boolean,
  postUrl?: string,
  flow?: PostResultMessage['flow'],
): PostResultMessage {
  const mode = autoPost ? 'post' : 'preview';
  const lastCompletedStep = flow?.lastCompletedStep ??
    (autoPost ? 'post-flow' : 'preview-flow');
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

export function unconfirmedPostResult(
  platform: PlatformId,
  flow: Partial<PostFlowTrace> = {},
): PostResultMessage {
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

export function withFlow(
  result: PostResultMessage,
  flow: Partial<PostFlowTrace>,
): PostResultMessage {
  const stageTimings = [
    ...(flow.stageTimings ?? []),
    ...(result.flow?.stageTimings ?? []),
  ];
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
      totalDurationMs: result.flow?.totalDurationMs ?? flow.totalDurationMs,
      stageTimings: stageTimings.length > 0 ? stageTimings : undefined,
    },
  };
}

export function withPostTiming(
  result: PostResultMessage,
  timing: NonNullable<PostFlowTrace['stageTimings']>[number],
  totalDurationMs?: number,
): PostResultMessage {
  return {
    ...result,
    flow: {
      submitReached: result.flow?.submitReached ?? false,
      ...result.flow,
      totalDurationMs: totalDurationMs ?? result.flow?.totalDurationMs,
      stageTimings: [...(result.flow?.stageTimings ?? []), timing],
    },
  };
}

export function shouldRunPostCompletionSideEffects(
  autoPost: boolean,
  results: readonly PostResultMessage[],
): boolean {
  return autoPost && realPostResults(results).length > 0;
}
