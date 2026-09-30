import { Window } from 'happy-dom';
import { describe, expect, it } from 'vitest';
import {
  parseYouTubeVideoId,
  readYouTubeUploadVideoId,
  resolveYouTubePublishState,
} from './youtube-studio-dom';

const HIDDEN = 'data-hidden';
const isRendered = (element: HTMLElement): boolean => !element.closest(`[${HIDDEN}]`);

function render(html: string): ParentNode {
  const window = new Window();
  window.document.body.innerHTML = html;
  return window.document as unknown as ParentNode;
}

const WIZARD = `
  <ytcp-uploads-dialog workflow-step="REVIEW" video-id="s_4qeVph9m8">
    <tp-yt-paper-dialog role="dialog">
      <a href="https://youtu.be/s_4qeVph9m8">https://youtu.be/s_4qeVph9m8</a>
      <ytcp-button id="done-button" role="button"><button>Publish</button></ytcp-button>
    </tp-yt-paper-dialog>
  </ytcp-uploads-dialog>`;

// Studio keeps closed dialogs mounted permanently.
const CLOSED_DIALOGS = `
  <ytcp-dialog ${HIDDEN}><tp-yt-paper-dialog role="dialog">
    <button>Publish</button>
  </tp-yt-paper-dialog></ytcp-dialog>`;

describe('readYouTubeUploadVideoId', () => {
  it('reads the ID Studio assigns to the upload wizard', () => {
    expect(readYouTubeUploadVideoId(render(WIZARD))).toBe('s_4qeVph9m8');
  });

  it('falls back to the video link while the attribute is missing', () => {
    const root = render(`
      <ytcp-uploads-dialog><a href="https://youtu.be/abcdefghijk">link</a></ytcp-uploads-dialog>`);
    expect(readYouTubeUploadVideoId(root)).toBe('abcdefghijk');
  });

  it('returns null before the upload is registered', () => {
    expect(readYouTubeUploadVideoId(render('<ytcp-uploads-dialog></ytcp-uploads-dialog>')))
      .toBeNull();
  });
});

describe('parseYouTubeVideoId', () => {
  it.each([
    ['https://youtu.be/abcdefghijk', 'abcdefghijk'],
    ['https://www.youtube.com/shorts/abcdefghijk', 'abcdefghijk'],
    ['https://www.youtube.com/watch?v=abcdefghijk', 'abcdefghijk'],
    ['https://support.google.com/youtube/answer/9080341', null],
    ['https://www.youtube.com/channel/UC123', null],
  ])('%s -> %s', (url, id) => {
    expect(parseYouTubeVideoId(url)).toBe(id);
  });
});

describe('resolveYouTubePublishState', () => {
  it('never re-clicks the wizard Publish button as a confirmation', () => {
    const state = resolveYouTubePublishState(
      render(WIZARD + CLOSED_DIALOGS),
      's_4qeVph9m8',
      isRendered,
    );
    expect(state).toEqual({ kind: 'pending', step: 'REVIEW', dialogButtons: [] });
  });

  it('confirms "We\'re still checking your content" with Publish anyway', () => {
    const root = render(WIZARD + CLOSED_DIALOGS + `
      <ytcp-dialog><tp-yt-paper-dialog role="dialog">
        <p>We're still checking your content</p>
        <ytcp-button role="button"><button>Back</button></ytcp-button>
        <ytcp-button id="anyway" role="button"><button>Publish anyway</button></ytcp-button>
      </tp-yt-paper-dialog></ytcp-dialog>`);
    const state = resolveYouTubePublishState(root, 's_4qeVph9m8', isRendered);
    expect(state.kind).toBe('confirm');
    expect(state.kind === 'confirm' && state.button.textContent?.trim()).toBe('Publish anyway');
  });

  it('confirms a nested confirmation dialog rendered inside the wizard', () => {
    const root = render(`
      <ytcp-uploads-dialog video-id="s_4qeVph9m8">
        <tp-yt-paper-dialog role="dialog">
          <ytcp-button id="done-button" role="button"><button>Publish</button></ytcp-button>
          <ytcp-dialog><div role="alertdialog">
            <button>このまま公開</button>
          </div></ytcp-dialog>
        </tp-yt-paper-dialog>
      </ytcp-uploads-dialog>`);
    const state = resolveYouTubePublishState(root, 's_4qeVph9m8', isRendered);
    expect(state.kind === 'confirm' && state.button.textContent).toBe('このまま公開');
  });

  it('returns the Shorts link from the published dialog', () => {
    const root = render(`
      <ytcp-uploads-dialog video-id="s_4qeVph9m8">
        <tp-yt-paper-dialog role="dialog" ${HIDDEN}></tp-yt-paper-dialog>
      </ytcp-uploads-dialog>
      <ytcp-video-share-dialog><tp-yt-paper-dialog role="dialog">
        <a href="https://youtube.com/shorts/s_4qeVph9m8">link</a>
        <button>Close</button>
      </tp-yt-paper-dialog></ytcp-video-share-dialog>`);
    expect(resolveYouTubePublishState(root, 's_4qeVph9m8', isRendered)).toEqual({
      kind: 'published',
      url: 'https://www.youtube.com/shorts/s_4qeVph9m8',
    });
  });

  it('reads the published link shown as plain text while the wizard is still mounted', () => {
    const root = render(WIZARD + `
      <ytcp-dialog><tp-yt-paper-dialog role="dialog">
        <h1>Video published</h1>
        <span id="share-url">youtube.com/shorts/s_4qeVph9m8</span>
        <ytcp-icon-button role="button" aria-label="Close"></ytcp-icon-button>
        <ytcp-button role="button"><button>Close</button></ytcp-button>
      </tp-yt-paper-dialog></ytcp-dialog>`);
    expect(resolveYouTubePublishState(root, 's_4qeVph9m8', isRendered)).toEqual({
      kind: 'published',
      url: 'https://www.youtube.com/shorts/s_4qeVph9m8',
    });
  });

  it('treats a link-less post-publish dialog over the mounted wizard as published', () => {
    const root = render(WIZARD + `
      <ytcp-uploads-still-processing-dialog><ytcp-dialog><tp-yt-paper-dialog role="dialog">
        <p>Video processing will continue</p>
        <ytcp-icon-button role="button" aria-label="Close"></ytcp-icon-button>
        <ytcp-button role="button"><button>Close</button></ytcp-button>
      </tp-yt-paper-dialog></ytcp-dialog></ytcp-uploads-still-processing-dialog>`);
    expect(resolveYouTubePublishState(root, 's_4qeVph9m8', isRendered))
      .toEqual({ kind: 'published' });
  });

  it('keeps waiting while an unrelated Close-only dialog is shown', () => {
    const root = render(WIZARD + `
      <ytcp-dialog><tp-yt-paper-dialog role="dialog">
        <p>Something went wrong</p>
        <ytcp-button role="button"><button>Close</button></ytcp-button>
      </tp-yt-paper-dialog></ytcp-dialog>`);
    expect(resolveYouTubePublishState(root, 's_4qeVph9m8', isRendered).kind).toBe('pending');
  });

  it('ignores links to other videos', () => {
    const root = render(WIZARD + `
      <div role="dialog"><a href="https://youtu.be/otherVideo1">other</a></div>`);
    expect(resolveYouTubePublishState(root, 's_4qeVph9m8', isRendered).kind).toBe('pending');
  });

  it('treats the closed wizard as published', () => {
    const root = render(CLOSED_DIALOGS);
    expect(resolveYouTubePublishState(root, 's_4qeVph9m8', isRendered))
      .toEqual({ kind: 'published' });
  });
});
