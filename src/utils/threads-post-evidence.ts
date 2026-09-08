export interface ThreadsPostEvidenceInput {
  currentPostUrl?: string;
  preSubmitPostUrl?: string;
  exactCapturedPostUrl?: string;
  preSubmitProfilePostUrl?: string;
  currentProfilePostUrl?: string;
}

/**
 * Accept only URL evidence tied to this submission. Rendered feed links are
 * intentionally outside this boundary because Threads can place the composer
 * and unrelated posts under the same high-level DOM ancestor.
 */
export function resolveThreadsPostEvidenceUrl(
  input: ThreadsPostEvidenceInput,
): string | undefined {
  if (input.exactCapturedPostUrl) return input.exactCapturedPostUrl;
  if (input.currentPostUrl && input.currentPostUrl !== input.preSubmitPostUrl) {
    return input.currentPostUrl;
  }
  // A failed/empty baseline cannot establish that a profile link is new.
  if (
    input.preSubmitProfilePostUrl &&
    input.currentProfilePostUrl !== input.preSubmitProfilePostUrl
  ) {
    return input.currentProfilePostUrl;
  }
  return undefined;
}
