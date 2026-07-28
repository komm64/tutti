import { Window } from 'happy-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildYouTubeStudioCaptureTarget,
  buildYouTubeStudioContentUrl,
  captureYouTubeStudioPostIdBaselineStateInPage,
  captureYouTubeStudioPostIdsFromTab,
  captureYouTubeStudioPostIdsInPage,
  captureYouTubeStudioPostUrlInPage,
} from './post-url-youtube-studio';

describe('YouTube Studio post URL capture', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('uses the same Untitled fallback as the upload form for an empty caption', () => {
    expect(buildYouTubeStudioCaptureTarget('')).toBe('Untitled');
  });

  it('builds the newest-first content URL from a Studio channel page', () => {
    expect(buildYouTubeStudioContentUrl(
      'https://studio.youtube.com/channel/UC123',
    )).toContain('/channel/UC123/videos/upload?');
    expect(buildYouTubeStudioContentUrl('https://studio.youtube.com/')).toBeUndefined();
    expect(buildYouTubeStudioContentUrl('https://www.youtube.com/channel/UC123')).toBeUndefined();
  });

  it('captures the unique video IDs visible before submission', () => {
    const window = new Window();
    window.document.body.innerHTML = `
      <a href="https://studio.youtube.com/video/first/edit">First</a>
      <a href="https://www.youtube.com/watch?v=ignored">Watch</a>
      <a href="https://studio.youtube.com/video/first/analytics">Duplicate</a>
      <a href="https://studio.youtube.com/video/second/edit">Second</a>
    `;

    expect(captureYouTubeStudioPostIdsInPage(
      window.document as unknown as ParentNode,
    )).toEqual(['first', 'second']);
  });

  it('waits for real rows but accepts an explicit empty-channel state', () => {
    const loadingWindow = new Window();
    loadingWindow.document.body.innerHTML = '<ytcp-video-section>Video</ytcp-video-section>';
    expect(captureYouTubeStudioPostIdBaselineStateInPage(
      loadingWindow.document as unknown as ParentNode,
    )).toEqual({ ids: [], settled: false });

    const emptyWindow = new Window();
    emptyWindow.document.body.innerHTML =
      '<ytcp-video-list-empty-state>No videos available</ytcp-video-list-empty-state>';
    expect(captureYouTubeStudioPostIdBaselineStateInPage(
      emptyWindow.document as unknown as ParentNode,
    )).toEqual({ ids: [], settled: true });
  });

  it('captures the baseline in an isolated tab without navigating the compose tab', async () => {
    vi.useFakeTimers();
    const create = vi.fn(async () => ({ id: 8, windowId: 3 }));
    const get = vi.fn(async (tabId: number) => {
      if (tabId === 7) {
        return {
          id: 7,
          windowId: 3,
          url: 'https://studio.youtube.com/channel/UC123',
        };
      }
      return { id: 8, windowId: 3, status: 'complete' };
    });
    const remove = vi.fn(async () => undefined);
    const update = vi.fn();
    const listeners = new Set<(tabId: number, info: { status?: string }) => void>();
    const executeScript = vi.fn(async (
      options: { func: (...args: never[]) => unknown },
    ) => [{
      result: options.func === captureYouTubeStudioPostIdBaselineStateInPage
        ? { ids: ['older-id'], settled: true }
        : true,
    }]);
    vi.stubGlobal('browser', {
      tabs: {
        create,
        get,
        remove,
        update,
        onUpdated: {
          addListener: (listener: (tabId: number, info: { status?: string }) => void) => {
            listeners.add(listener);
          },
          removeListener: (listener: (tabId: number, info: { status?: string }) => void) => {
            listeners.delete(listener);
          },
        },
      },
      scripting: { executeScript },
    });

    const pending = captureYouTubeStudioPostIdsFromTab(7, vi.fn());
    await vi.advanceTimersByTimeAsync(250);
    await vi.advanceTimersByTimeAsync(1500);

    await expect(pending).resolves.toEqual(['older-id']);
    expect(create).toHaveBeenCalledWith({
      url: expect.stringContaining('/channel/UC123/videos/upload?'),
      active: false,
      windowId: 3,
    });
    expect(update).not.toHaveBeenCalled();
    expect(executeScript).toHaveBeenCalledWith(expect.objectContaining({
      target: { tabId: 8 },
    }));
    expect(remove).toHaveBeenCalledWith(8);
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
      [],
      window.document as unknown as ParentNode,
    )).resolves.toEqual({
      url: 'https://www.youtube.com/watch?v=new-video-id',
      trace: [
        'matched new target title in scoped video card ' +
        '(attempt=0, depth=1, excluded=0)',
      ],
    });
  });

  it('selects only a new matching Studio row when multiple Untitled uploads exist', async () => {
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
      ['older-id'],
      window.document as unknown as ParentNode,
    )).resolves.toEqual({
      url: 'https://www.youtube.com/watch?v=newest-id',
      trace: [
        'matched new target title in scoped video card ' +
        '(attempt=0, depth=1, excluded=1)',
      ],
    });
  });
});
