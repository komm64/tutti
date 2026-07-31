// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { injectImages } from './image';

const REQ_TAG = 'tutti-inject-req-v1';
const RES_TAG = 'tutti-inject-res-v1';

describe('media focus lease', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    vi.unstubAllGlobals();
  });

  it('focuses only after video materialization and releases at input dispatch', async () => {
    document.body.innerHTML = '<input type="file" data-testid="media">';
    const sendMessage = vi.fn(async (_message: unknown) => ({ ok: true, active: true }));
    vi.stubGlobal('browser', {
      runtime: { sendMessage },
    });

    const onRequest = (event: MessageEvent): void => {
      const request = event.data as { source?: string; id?: string } | undefined;
      if (request?.source !== REQ_TAG || typeof request.id !== 'string') return;
      window.dispatchEvent(new MessageEvent('message', {
        source: window,
        data: {
          source: RES_TAG,
          id: request.id,
          ok: true,
          phase: 'media-dispatched',
        },
      }));
      window.dispatchEvent(new MessageEvent('message', {
        source: window,
        data: {
          source: RES_TAG,
          id: request.id,
          ok: true,
          fileCount: 1,
          uploadCount: 1,
          acceptedByPreview: true,
          uploadTimedOut: false,
        },
      }));
    };
    window.addEventListener('message', onRequest);

    try {
      await injectImages(
        [{
          name: 'test.mp4',
          type: 'video/mp4',
          data: 'AA==',
        }],
        '[data-testid="media"]',
        {
          implementationPath: 'next',
          requestPostingWindowMediaFocus: true,
        },
      );
    } finally {
      window.removeEventListener('message', onRequest);
    }

    const focusMessages = sendMessage.mock.calls
      .map(([message]) => message)
      .filter(
        (message): message is { type: string; phase: string } =>
          typeof message === 'object' &&
          message !== null &&
          'type' in message &&
          message.type === 'POSTING_MEDIA_FOCUS',
      );
    expect(focusMessages).toEqual([
      { type: 'POSTING_MEDIA_FOCUS', phase: 'acquire' },
      { type: 'POSTING_MEDIA_FOCUS', phase: 'release' },
    ]);
  });
});
