import type { PostResultMessage } from '../messages';
import { t } from '../utils/i18n';

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

export function shouldRunPostCompletionSideEffects(
  autoPost: boolean,
  results: readonly PostResultMessage[],
): boolean {
  return autoPost && realPostResults(results).length > 0;
}
