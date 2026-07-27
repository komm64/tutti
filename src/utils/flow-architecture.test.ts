import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('content flow architecture', () => {
  it('keeps submit finalization shared by simple and multi-step flows', () => {
    const postFlow = readFileSync('src/utils/post-flow.ts', 'utf8');
    const stepRunner = readFileSync('src/utils/step-runner.ts', 'utf8');

    for (const source of [postFlow, stepRunner]) {
      expect(source).toContain("from './flow-finalization'");
      expect(source).toContain('waitForSubmitButton(');
      expect(source).toContain('highlightPreviewButton(');
      expect(source).toContain('finalizeFlow(');
      expect(source).not.toMatch(/\bmarkPostSubmissionStarted\b/);
    }
    expect(postFlow).not.toMatch(/\bfunction maybeConfirmDialog\b/);
    expect(stepRunner).not.toContain("from './post-flow'");
  });
});
