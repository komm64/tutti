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

export function shouldRunPostCompletionSideEffects(
  autoPost: boolean,
  results: readonly PostResultMessage[],
): boolean {
  return autoPost && postedResults(results).length > 0;
}
