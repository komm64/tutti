// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createMediaCommandHandlers,
  type MediaCommandFile,
  type MediaCommandRuntime,
  type MediaUploadWaitResult,
} from './media-commands';

const SOURCE = 'tutti-inject-res-v1';
const image: MediaCommandFile = {
  name: 'test.png',
  type: 'image/png',
  data: 'AA==',
};
const video: MediaCommandFile = {
  name: 'test.mp4',
  type: 'video/mp4',
  data: 'AA==',
};

function dataTransfer(...files: MediaCommandFile[]): DataTransfer {
  const transfer = new DataTransfer();
  for (const file of files) {
    transfer.items.add(new File(['data'], file.name, { type: file.type }));
  }
  return transfer;
}

function createRuntime(
  wait: MediaUploadWaitResult = {
    uploadCount: 1,
    timedOut: false,
    acceptedByPreview: false,
  },
): MediaCommandRuntime {
  return {
    findElement: (selector) => {
      const el = document.querySelector<HTMLElement>(selector);
      return el ? { el, matchedPart: selector } : null;
    },
    buildDataTransfer: (files) => ({ dt: dataTransfer(...files) }),
    mediaPreviewScope: (target) => target.parentNode ?? document,
    countMediaPreviews: vi.fn(() => 2),
    mediaAcceptedPredicate: vi.fn(() => () => true),
    mediaRejectionMessage: vi.fn(() => undefined),
    waitForUploadComplete: vi.fn(async () => wait),
  };
}

beforeEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('page-world media commands', () => {
  it('injects files and preserves change/input event order', async () => {
    document.body.innerHTML = '<div role="dialog"><input type="file"></div>';
    const input = document.querySelector<HTMLInputElement>('input')!;
    const events: string[] = [];
    input.addEventListener('change', () => events.push('change'));
    input.addEventListener('input', () => events.push('input'));
    const runtime = createRuntime();
    const handlers = createMediaCommandHandlers(SOURCE, runtime);

    const result = await handlers.input({
      id: 'input-1',
      selector: 'input',
      files: [image],
      uploadTimeoutMs: 1234,
    });

    expect(result).toEqual({
      source: SOURCE,
      id: 'input-1',
      ok: true,
      error: undefined,
      fileCount: 1,
      uploadCount: 1,
      acceptedByPreview: false,
      uploadTimedOut: false,
    });
    expect(events).toEqual(['change', 'input']);
    expect(runtime.waitForUploadComplete).toHaveBeenCalledWith(1234, {
      requireMediaAccepted: false,
      requirePreviewAccepted: false,
      requireUploadComplete: false,
      isMediaPreviewVisible: undefined,
      getMediaRejectionMessage: undefined,
    });
  });

  it('dispatches dragenter/dragover/drop at the target center', async () => {
    document.body.innerHTML = '<div class="drop"></div>';
    const target = document.querySelector<HTMLElement>('.drop')!;
    const getBoundingClientRect = vi.spyOn(target, 'getBoundingClientRect').mockReturnValue({
      x: 10,
      y: 20,
      left: 10,
      top: 20,
      right: 110,
      bottom: 80,
      width: 100,
      height: 60,
      toJSON: () => ({}),
    });
    const events: string[] = [];
    for (const type of ['dragenter', 'dragover', 'drop']) {
      target.addEventListener(type, () => events.push(type));
    }
    const runtime = createRuntime();
    const handlers = createMediaCommandHandlers(SOURCE, runtime);

    const result = await handlers.drop({
      id: 'drop-1',
      selector: '.drop',
      files: [image],
    });

    expect(result).toMatchObject({
      source: SOURCE,
      id: 'drop-1',
      ok: true,
      fileCount: 1,
      droppedOn: 'DIV',
    });
    expect(getBoundingClientRect).toHaveBeenCalledOnce();
    expect(events).toEqual(['dragenter', 'dragover', 'drop']);
  });

  it('requires acceptance and preview evidence for video when requested', async () => {
    document.body.innerHTML = '<input type="file">';
    const runtime = createRuntime();
    const handlers = createMediaCommandHandlers(SOURCE, runtime);

    await handlers.input({
      id: 'input-video',
      selector: 'input',
      files: [video],
      requireMediaPreview: true,
    });

    expect(runtime.mediaAcceptedPredicate).toHaveBeenCalledWith(
      document.querySelector('input'),
      2,
    );
    expect(runtime.waitForUploadComplete).toHaveBeenCalledWith(30000, expect.objectContaining({
      requireMediaAccepted: true,
      requirePreviewAccepted: true,
      requireUploadComplete: false,
      isMediaPreviewVisible: expect.any(Function),
      getMediaRejectionMessage: expect.any(Function),
    }));
  });

  it('forwards strict upload completion separately from preview acceptance', async () => {
    document.body.innerHTML = '<input type="file">';
    const runtime = createRuntime();
    const handlers = createMediaCommandHandlers(SOURCE, runtime);

    await handlers.input({
      id: 'strict-video-upload',
      selector: 'input',
      files: [video],
      requireMediaPreview: true,
      requireUploadComplete: true,
    });

    expect(runtime.waitForUploadComplete).toHaveBeenCalledWith(30000, expect.objectContaining({
      requireMediaAccepted: true,
      requirePreviewAccepted: true,
      requireUploadComplete: true,
    }));
  });

  it('preserves missing-target and DataTransfer errors', async () => {
    const runtime = createRuntime();
    const handlers = createMediaCommandHandlers(SOURCE, runtime);
    await expect(handlers.input({
      id: 'missing-input',
      selector: 'input',
      files: [image],
    })).resolves.toEqual({
      source: SOURCE,
      id: 'missing-input',
      ok: false,
      error: 'file input not found',
    });
    await expect(handlers.drop({
      id: 'missing-drop',
      selector: '.drop',
      files: [image],
    })).resolves.toEqual({
      source: SOURCE,
      id: 'missing-drop',
      ok: false,
      error: 'drop target not found',
    });

    document.body.innerHTML = '<input type="file">';
    runtime.buildDataTransfer = () => ({ error: 'invalid base64' });
    await expect(handlers.input({
      id: 'bad-file',
      selector: 'input',
      files: [image],
    })).resolves.toEqual({
      source: SOURCE,
      id: 'bad-file',
      ok: false,
      error: 'invalid base64',
    });
  });

  it('distinguishes preview-accepted timeout from rejection and hard timeout', async () => {
    document.body.innerHTML = '<input type="file">';

    const accepted = createMediaCommandHandlers(SOURCE, createRuntime({
      uploadCount: 0,
      timedOut: true,
      acceptedByPreview: true,
    }));
    await expect(accepted.input({
      id: 'accepted',
      selector: 'input',
      files: [video],
    })).resolves.toMatchObject({ ok: true, error: undefined, uploadTimedOut: true });

    const rejected = createMediaCommandHandlers(SOURCE, createRuntime({
      uploadCount: 0,
      timedOut: false,
      acceptedByPreview: false,
      error: 'media rejected',
    }));
    await expect(rejected.input({
      id: 'rejected',
      selector: 'input',
      files: [video],
    })).resolves.toMatchObject({ ok: false, error: 'media rejected' });

    const timedOut = createMediaCommandHandlers(SOURCE, createRuntime({
      uploadCount: 0,
      timedOut: true,
      acceptedByPreview: false,
    }));
    await expect(timedOut.input({
      id: 'timed-out',
      selector: 'input',
      files: [video],
    })).resolves.toMatchObject({
      ok: false,
      error: 'Timed out while waiting for the media upload or preview',
    });

    const strict = createMediaCommandHandlers(SOURCE, createRuntime({
      uploadCount: 0,
      timedOut: true,
      acceptedByPreview: true,
    }));
    await expect(strict.input({
      id: 'strict-timeout',
      selector: 'input',
      files: [video],
      requireUploadComplete: true,
    })).resolves.toMatchObject({
      ok: false,
      error: 'Timed out while waiting for the media upload or preview',
    });
  });
});
