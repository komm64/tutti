import { describe, expect, it, vi } from 'vitest';
import type { ImagePreview } from './types';
import {
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
});
