import type { PostResultMessage } from '../messages';

export function toPreviewResult(result: PostResultMessage): PostResultMessage {
  const { url: _url, verify: _verify, ...rest } = result;
  return {
    ...rest,
    preview: true,
    confirmed: result.success ? true : result.confirmed,
  };
}

export function postedResults(results: readonly PostResultMessage[]): PostResultMessage[] {
  return results.filter((result) => !result.preview);
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
