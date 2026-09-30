import { Window } from 'happy-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../utils/web-action-pacing', () => ({
  waitForWebActionPacing: vi.fn(async () => 0),
}));
import {
  buildYouTubeStudioCaptureTarget,
  buildYouTubeStudioContentUrl,
  captureYouTubeStudioPostUrlFromTab,
  captureYouTubeStudioPostUrlInPage,
  inspectYouTubeStudioDispatchStateInPage,
  waitForYouTubeStudioDispatchReady,
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

  it('recognizes only a channel dashboard with an upload control as dispatch-ready', () => {
    const window = new Window();
    window.document.body.innerHTML = '<ytcp-button id="upload-button">Upload videos</ytcp-button>';

    expect(inspectYouTubeStudioDispatchStateInPage(
      window.document as unknown as ParentNode,
      'https://studio.youtube.com/',
      10,
    )).toEqual({
      channelReady: false,
      dashboardReady: true,
      documentTimeOrigin: 10,
    });
    expect(inspectYouTubeStudioDispatchStateInPage(
      window.document as unknown as ParentNode,
      'https://studio.youtube.com/channel/UC123',
      10,
    )).toEqual({
      channelReady: true,
      dashboardReady: true,
      documentTimeOrigin: 10,
    });
  });

  it('waits for the canonical dashboard document to remain stable before dispatch', async () => {
    vi.useFakeTimers();
    const states = [
      { channelReady: false, dashboardReady: false, documentTimeOrigin: 1 },
      { channelReady: true, dashboardReady: true, documentTimeOrigin: 1 },
      { channelReady: true, dashboardReady: true, documentTimeOrigin: 2 },
    ];
    const executeScript = vi.fn(async () => [{
      result: states.shift() ?? {
        channelReady: true,
        dashboardReady: true,
        documentTimeOrigin: 2,
      },
    }]);
    vi.stubGlobal('browser', {
      scripting: { executeScript },
    });

    const pending = waitForYouTubeStudioDispatchReady(7);
    await vi.advanceTimersByTimeAsync(2_000);

    await expect(pending).resolves.toBeUndefined();
    expect(executeScript).toHaveBeenCalledWith(expect.objectContaining({
      target: { tabId: 7 },
      func: inspectYouTubeStudioDispatchStateInPage,
      world: 'ISOLATED',
    }));
    expect(executeScript.mock.calls.length).toBeGreaterThanOrEqual(6);
  });


  it('opens the newest-first Shorts list when capturing the submitted URL', async () => {
    vi.useFakeTimers();
    const update = vi.fn(async () => ({
      id: 7,
      url: 'https://studio.youtube.com/channel/UC123/videos/short',
    }));
    const get = vi.fn(async () => ({
      id: 7,
      status: 'complete',
      url: 'https://studio.youtube.com/channel/UC123',
    }));
    const executeScript = vi.fn(async (
      options: { func: (...args: never[]) => unknown },
    ) => [{
      result: options.func === captureYouTubeStudioPostUrlInPage
        ? {
            url: 'https://www.youtube.com/watch?v=new-id',
            trace: ['matched target'],
          }
        : true,
    }]);
    vi.stubGlobal('browser', {
      tabs: {
        get,
        update,
        onUpdated: {
          addListener: vi.fn(),
          removeListener: vi.fn(),
        },
      },
      scripting: { executeScript },
    });

    const pending = captureYouTubeStudioPostUrlFromTab(7, '', vi.fn());
    await vi.advanceTimersByTimeAsync(250);

    await expect(pending).resolves.toBe(
      'https://www.youtube.com/watch?v=new-id',
    );
    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith(7, {
      url: expect.stringContaining('/channel/UC123/videos/short?'),
    });
    expect(executeScript).toHaveBeenCalledWith(expect.objectContaining({
      target: { tabId: 7 },
      args: ['Untitled', 30],
    }));
  });

  it('falls back from the Shorts tab to the Videos tab', async () => {
    vi.useFakeTimers();
    const update = vi.fn(async (_tabId: number, _props: { url: string }) => ({ id: 7 }));
    const get = vi.fn(async () => ({
      id: 7,
      status: 'complete',
      url: 'https://studio.youtube.com/channel/UC123',
    }));
    const pageResults = [
      { trace: ['newest Studio row does not match the target title'] },
      { url: 'https://www.youtube.com/watch?v=long-id', trace: [] },
    ];
    const executeScript = vi.fn(async (
      options: { func: (...args: never[]) => unknown },
    ) => [{
      result: options.func === captureYouTubeStudioPostUrlInPage
        ? pageResults.shift()
        : true,
    }]);
    vi.stubGlobal('browser', {
      tabs: {
        get,
        update,
        onUpdated: { addListener: vi.fn(), removeListener: vi.fn() },
      },
      scripting: { executeScript },
    });

    const pending = captureYouTubeStudioPostUrlFromTab(7, 'caption', vi.fn());
    await vi.advanceTimersByTimeAsync(1_000);

    await expect(pending).resolves.toBe('https://www.youtube.com/watch?v=long-id');
    expect(update.mock.calls.map(([, props]) => props.url)).toEqual([
      expect.stringContaining('/videos/short?'),
      expect.stringContaining('/videos/upload?'),
    ]);
  });

  it('accepts the newest Studio row when its title matches', async () => {
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
      1,
      window.document as unknown as ParentNode,
    )).resolves.toEqual({
      url: 'https://www.youtube.com/watch?v=newest-id',
      trace: ['matched target title in the newest Studio row (attempt=0)'],
    });
  });

  it('never reports an older upload that shares the title', async () => {
    const window = new Window();
    window.document.body.innerHTML = `
      <ytcp-video-row>
        <a id="video-title" href="https://studio.youtube.com/video/other-id/edit">
          Something else
        </a>
      </ytcp-video-row>
      <ytcp-video-row>
        <a id="video-title" href="https://studio.youtube.com/video/older-id/edit">
          caption
        </a>
      </ytcp-video-row>
    `;

    await expect(captureYouTubeStudioPostUrlInPage(
      'caption',
      1,
      window.document as unknown as ParentNode,
    )).resolves.toEqual({
      trace: ['newest Studio row does not match the target title'],
    });
  });
});
