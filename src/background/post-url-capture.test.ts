import { describe, expect, it } from 'vitest';
import { buildPostUrlCaptureRetryPlan } from './post-url-capture';

describe('post URL capture retry plan', () => {
  it('keeps YouTube single-pass because its capture path already waits for the Studio listing', () => {
    expect(buildPostUrlCaptureRetryPlan('youtube')).toEqual([
      { label: 'immediate', delayMs: 0 },
    ]);
  });

  it('adds a late pass for profile based capture platforms without repeating every intermediate pass', () => {
    for (const platform of ['threads', 'tumblr', 'x', 'pixiv', 'tiktok'] as const) {
      expect(buildPostUrlCaptureRetryPlan(platform)).toEqual([
        { label: 'immediate', delayMs: 0 },
        { label: 'late-api-or-profile', delayMs: 10000 },
      ]);
    }
  });

  it('uses an extra settled pass for Instagram because capture relies on async configure responses', () => {
    expect(buildPostUrlCaptureRetryPlan('instagram')).toEqual([
      { label: 'immediate', delayMs: 0 },
      { label: 'settled-page', delayMs: 3000 },
      { label: 'late-api-response', delayMs: 10000 },
    ]);
  });

  it('uses a shorter settled-page retry for API-oriented platforms', () => {
    for (const platform of ['mastodon', 'misskey', 'bluesky', 'deviantart'] as const) {
      expect(buildPostUrlCaptureRetryPlan(platform)).toEqual([
        { label: 'immediate', delayMs: 0 },
        { label: 'settled-page', delayMs: 3000 },
      ]);
    }
  });
});
