import type { PostResultMessage } from '../messages';

export function toPreviewResult(result: PostResultMessage): PostResultMessage {
  const { url: _url, verify: _verify, confirmed: _confirmed, ...rest } = result;
  return {
    ...rest,
    preview: true,
  };
}

export function postedResults(results: readonly PostResultMessage[]): PostResultMessage[] {
  return results.filter((result) => !result.preview);
}

export function normalizePostEvidence(result: PostResultMessage): PostResultMessage {
  if (result.success && result.url && result.confirmed !== true) {
    return { ...result, confirmed: true };
  }
  return result;
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
    error: hardIssue.message,
  };
}

export function shouldRunPostCompletionSideEffects(
  autoPost: boolean,
  results: readonly PostResultMessage[],
): boolean {
  return autoPost && postedResults(results).length > 0;
}
