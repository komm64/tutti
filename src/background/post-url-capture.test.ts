import { describe, expect, it } from 'vitest';
import { Window } from 'happy-dom';
import {
  buildPostUrlCaptureRetryPlan,
  buildPostUrlCaptureScriptArgs,
  captureYouTubeStudioPostUrlInPage,
} from './post-url-capture';

describe('post URL capture retry plan', () => {
  it('reloads YouTube Studio after delayed processing when the first listing pass is stale', () => {
    expect(buildPostUrlCaptureRetryPlan('youtube')).toEqual([
      { label: 'immediate', delayMs: 0 },
      { label: 'processing-settle', delayMs: 15000 },
      { label: 'final-dashboard-refresh', delayMs: 30000 },
    ]);
  });

  it('adds a final settle pass for Threads and Tumblr because their post URLs can lag', () => {
    for (const platform of ['threads', 'tumblr'] as const) {
      expect(buildPostUrlCaptureRetryPlan(platform)).toEqual([
        { label: 'immediate', delayMs: 0 },
        { label: 'late-api-or-profile', delayMs: 10000 },
        { label: 'final-profile-settle', delayMs: 30000 },
      ]);
    }
  });

  it('adds a late pass for other profile based capture platforms without repeating every intermediate pass', () => {
    for (const platform of ['x', 'pixiv', 'tiktok'] as const) {
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

describe('post URL capture script arguments', () => {
  it('uses JSON-safe nulls when optional identity and timestamp values are missing', () => {
    const args = buildPostUrlCaptureScriptArgs('tiktok', 'emoji post');

    expect(args).toEqual(['tiktok', 'emoji post', null, null]);
    expect(JSON.parse(JSON.stringify(args))).toEqual(args);
    expect(args).not.toContain(undefined);
  });

  it('preserves supplied identity and finite timestamp values', () => {
    expect(buildPostUrlCaptureScriptArgs(
      'youtube',
      'short title',
      'alice',
      123456,
    )).toEqual(['youtube', 'short title', 'alice', 123456]);
  });

  it('normalizes non-finite timestamps because executeScript args must be serializable', () => {
    expect(buildPostUrlCaptureScriptArgs(
      'youtube',
      'short title',
      undefined,
      Number.NaN,
    )).toEqual(['youtube', 'short title', null, null]);
  });
});

describe('YouTube Studio post URL capture', () => {
  it('finds the matching video card without depending on the localized dashboard heading', async () => {
    const window = new Window();
    window.document.body.innerHTML = `
      <a href="https://studio.youtube.com/video/older-video/edit">Older video</a>
      <section>
        <div>Latest video performance</div>
        <article>
          <h2 id="title">tutti surface matrix video 2026-07-25T23-42-46</h2>
          <div>
            <a href="https://studio.youtube.com/video/new-video-id/analytics/tab-overview">
              Analytics
            </a>
          </div>
        </article>
      </section>
    `;

    await expect(captureYouTubeStudioPostUrlInPage(
      'tutti surface matrix video 2026-07-25',
      window.document as unknown as ParentNode,
    )).resolves.toEqual({
      url: 'https://www.youtube.com/watch?v=new-video-id',
      trace: ['matched target title in scoped video card (attempt=0, depth=1)'],
    });
  });
});
