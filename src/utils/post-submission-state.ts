let submissionStarted = false;

export function resetPostSubmissionState(): void {
  submissionStarted = false;
}

export function markPostSubmissionStarted(): void {
  submissionStarted = true;
}

export function hasPostSubmissionStarted(): boolean {
  return submissionStarted;
}
