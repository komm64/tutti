import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ImagePreview } from './types';

const mediaPreviewMocks = vi.hoisted(() => ({
  createImagePreview: vi.fn(async (file: File) => ({
    name: file.name,
    type: file.type,
    data: 'image-data',
    previewUrl: `blob:${file.name}`,
  })),
  createVideoPreview: vi.fn(async (file: File) => ({
    name: file.name,
    type: file.type,
    data: 'video-data',
    previewUrl: `blob:${file.name}`,
    durationS: 30,
  })),
  revokeImagePreview: vi.fn(),
  revokeImagePreviews: vi.fn(),
  revokeVideoPreview: vi.fn(),
}));

vi.mock('./media-preview', () => mediaPreviewMocks);

import {
  addFilesToMediaState,
  moveImageAt,
  removeImageAt,
  removeVideoFromState,
  type PopupMediaState,
} from './media-state';

vi.stubGlobal('URL', {
  revokeObjectURL: vi.fn(),
});

function image(name: string): ImagePreview {
  return {
    name,
    type: 'image/png',
    data: 'AA==',
    previewUrl: `blob:${name}`,
  };
}

describe('popup media state', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('removes image previews and matching alt text together', () => {
    const state: PopupMediaState = {
      images: [image('a'), image('b')],
      video: null,
      imageAlts: ['alt a', 'alt b'],
    };

    expect(removeImageAt(state, 0)).toMatchObject({
      images: [{ name: 'b' }],
      imageAlts: ['alt b'],
    });
  });

  it('moves image previews and alt text together', () => {
    const state: PopupMediaState = {
      images: [image('a'), image('b'), image('c')],
      video: null,
      imageAlts: ['alt a', 'alt b', 'alt c'],
    };

    expect(moveImageAt(state, 1, -1)).toMatchObject({
      images: [{ name: 'b' }, { name: 'a' }, { name: 'c' }],
      imageAlts: ['alt b', 'alt a', 'alt c'],
    });
  });

  it('removes video without changing image state', () => {
    const state: PopupMediaState = {
      images: [image('a')],
      video: {
        name: 'v',
        type: 'video/mp4',
        data: 'AA==',
        previewUrl: 'blob:v',
        durationS: 1,
      },
      imageAlts: ['alt a'],
    };

    expect(removeVideoFromState(state)).toMatchObject({
      images: [{ name: 'a' }],
      video: null,
      imageAlts: ['alt a'],
    });
  });

  it('normalizes mixed image and video input to video-only state', async () => {
    const state: PopupMediaState = {
      images: [image('existing')],
      video: null,
      imageAlts: ['existing alt'],
    };

    const result = await addFilesToMediaState(state, [
      { name: 'photo.png', type: 'image/png' } as File,
      { name: 'clip.mp4', type: 'video/mp4' } as File,
    ]);

    expect(result).toMatchObject({
      images: [],
      video: { name: 'clip.mp4', type: 'video/mp4', durationS: 30 },
      imageAlts: [],
    });
    expect(mediaPreviewMocks.createVideoPreview).toHaveBeenCalledWith(expect.objectContaining({ name: 'clip.mp4' }));
    expect(mediaPreviewMocks.createImagePreview).not.toHaveBeenCalled();
    expect(mediaPreviewMocks.revokeImagePreviews).toHaveBeenCalledWith(state.images);
  });
});
