export interface ThreadsPostEvidenceInput {
  currentPostUrl?: string;
  preSubmitPostUrl?: string;
  exactCapturedPostUrl?: string;
}

/**
 * Accept only URL evidence tied to this submission. Rendered feed links are
 * intentionally outside this boundary because Threads can place the composer
 * and unrelated posts under the same high-level DOM ancestor.
 */
export function resolveThreadsPostEvidenceUrl(
  input: ThreadsPostEvidenceInput,
): string | undefined {
  if (input.currentPostUrl && input.currentPostUrl !== input.preSubmitPostUrl) {
    return input.currentPostUrl;
  }
  return input.exactCapturedPostUrl;
}
