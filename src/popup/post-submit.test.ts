import { describe, expect, it } from 'vitest';
import type { PostResultMessage } from '../messages';
import {
  failedRetryPlatforms,
  isDurablePostedResult,
  mergePostResults,
  needsVideoPostingConfirmation,
  normalizeRetryGuardResults,
  sendPostRequest,
  shouldClearDraftAfterSubmit,
  uncertainPlatforms,
} from './post-submit';

describe('popup post submit policy', () => {
  it('requires the foreground warning only for real video posts', () => {
    const video = {
      name: 'clip.mp4',
      type: 'video/mp4',
      data: 'AA==',
      durationS: 5,
      previewUrl: 'blob:clip',
    };

    expect(needsVideoPostingConfirmation({ autoPost: true, video })).toBe(true);
    expect(needsVideoPostingConfirmation({ autoPost: false, video })).toBe(false);
    expect(needsVideoPostingConfirmation({ autoPost: true, video: null })).toBe(false);
  });

  it('builds and sends a POST_REQUEST through the provided runtime sender', async () => {
    const sent: unknown[] = [];
    const response = await sendPostRequest({
      text: 'hello',
      platforms: ['x'],
      images: [],
      video: null,
      imageAlts: [],
      autoPost: false,
      cw: '',
      visibility: 'public',
      trimToS: null,
      intent: 'new',
    }, async (message) => {
      sent.push(message);
      return { results: [{ type: 'POST_RESULT', platform: 'x', success: true, preview: true }] };
    });

    expect(sent[0]).toMatchObject({
      type: 'POST_REQUEST',
      requestId: expect.any(String),
      intent: 'new',
      text: 'hello',
      autoPost: false,
    });
    expect(response?.results?.[0]).toMatchObject({ platform: 'x', preview: true });
  });

  it('merges retry results without dropping unrelated successes', () => {
    const current: PostResultMessage[] = [
      { type: 'POST_RESULT', platform: 'x', success: true },
      { type: 'POST_RESULT', platform: 'threads', success: false, error: 'old' },
    ];
    const incoming: PostResultMessage[] = [
      { type: 'POST_RESULT', platform: 'threads', success: true },
    ];

    expect(mergePostResults(current, incoming, true)).toEqual([
      { type: 'POST_RESULT', platform: 'x', success: true },
      { type: 'POST_RESULT', platform: 'threads', success: true },
    ]);
  });

  it('clears drafts only for non-empty successful real post results', () => {
    const durable: PostResultMessage = {
      type: 'POST_RESULT',
      platform: 'x',
      success: true,
      confirmed: true,
      url: 'https://x.com/alice/status/123',
    };
    expect(shouldClearDraftAfterSubmit(true, [durable])).toBe(true);
    expect(shouldClearDraftAfterSubmit(false, [durable])).toBe(false);
    expect(shouldClearDraftAfterSubmit(true, [{ type: 'POST_RESULT', platform: 'x', success: true, preview: true }])).toBe(false);
    expect(shouldClearDraftAfterSubmit(true, [{ type: 'POST_RESULT', platform: 'x', success: true }])).toBe(false);
    expect(shouldClearDraftAfterSubmit(true, [])).toBe(false);
  });

  it('requires a URL as durable post evidence', () => {
    expect(isDurablePostedResult({
      type: 'POST_RESULT',
      platform: 'x',
      success: true,
      url: 'https://x.com/alice/status/123',
    })).toBe(true);
    expect(isDurablePostedResult({
      type: 'POST_RESULT',
      platform: 'tumblr',
      success: true,
      confirmed: true,
    })).toBe(false);
  });

  it('separates retryable failures from uncertain results', () => {
    const results: PostResultMessage[] = [
      { type: 'POST_RESULT', platform: 'x', success: false, error: 'failed' },
      { type: 'POST_RESULT', platform: 'threads', success: false, uncertain: true },
      { type: 'POST_RESULT', platform: 'bluesky', success: true },
    ];

    expect(failedRetryPlatforms(results)).toEqual(['x']);
    expect(uncertainPlatforms(results)).toEqual(['threads']);
  });

  it('normalizes only recent-success guard results for the existing retry UI', () => {
    const recentSuccess: PostResultMessage = {
      type: 'POST_RESULT',
      platform: 'x',
      success: false,
      error: 'already landed',
      submissionGuard: {
        decision: 'blocked',
        reason: 'recent-success',
        requestId: 'request-1',
      },
    };
    const inFlight: PostResultMessage = {
      type: 'POST_RESULT',
      platform: 'threads',
      success: false,
      error: 'still posting',
      submissionGuard: {
        decision: 'blocked',
        reason: 'in-flight',
        requestId: 'request-1',
      },
    };

    const normalized = normalizeRetryGuardResults([recentSuccess, inFlight]);

    expect(normalized[0]).toMatchObject({
      platform: 'x',
      success: true,
      error: undefined,
      verify: {
        verified: true,
        issues: [{
          kind: 'retry-dedup-skipped',
          message: 'already landed',
          severity: 'warn',
        }],
      },
    });
    expect(normalized[1]).toBe(inFlight);
  });
});
