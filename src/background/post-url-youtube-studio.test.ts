import { Window } from 'happy-dom';
import { describe, expect, it } from 'vitest';
import {
  buildYouTubeStudioCaptureTarget,
  captureYouTubeStudioPostUrlInPage,
} from './post-url-youtube-studio';

describe('YouTube Studio post URL capture', () => {
  it('uses the same Untitled fallback as the upload form for an empty caption', () => {
    expect(buildYouTubeStudioCaptureTarget('')).toBe('Untitled');
  });

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

  it('selects the first matching Studio row when multiple Untitled uploads exist', async () => {
    const window = new Window();
    window.document.body.innerHTML = `
      <ytcp-video-row>
        <a id="video-title" href="https://studio.youtube.com/video/newest-id/edit">
          Untitled
        </a>
      </ytcp-video-row>
      <ytcp-video-row>
        <a id="video-title" href="https://studio.youtube.com/video/older-id/edit">
          Untitled
        </a>
      </ytcp-video-row>
    `;

    await expect(captureYouTubeStudioPostUrlInPage(
      buildYouTubeStudioCaptureTarget(''),
      window.document as unknown as ParentNode,
    )).resolves.toEqual({
      url: 'https://www.youtube.com/watch?v=newest-id',
      trace: ['matched target title in scoped video card (attempt=0, depth=1)'],
    });
  });
});
