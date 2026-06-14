import { describe, expect, it } from 'vitest';
import { buildPostRequest } from './post-media';

describe('buildPostRequest', () => {
  it('builds a text-only request without optional fields', async () => {
    await expect(buildPostRequest({
      text: 'hello',
      platforms: ['x'],
      images: [],
      video: null,
      imageAlts: [],
      autoPost: false,
      cw: '',
      visibility: 'public',
      trimToS: null,
    })).resolves.toEqual({
      type: 'POST_REQUEST',
      text: 'hello',
      platforms: ['x'],
      images: undefined,
      autoPost: false,
      cw: undefined,
      visibility: undefined,
      trimVideoToSeconds: undefined,
    });
  });

  it('builds an image-only request with alt text', async () => {
    await expect(buildPostRequest({
      text: '',
      platforms: ['x'],
      images: [{
        name: 'photo.png',
        type: 'image/png',
        data: 'AA==',
        previewUrl: 'blob:photo',
      }],
      video: null,
      imageAlts: ['alt text'],
      autoPost: false,
      cw: '',
      visibility: 'public',
      trimToS: null,
    })).resolves.toMatchObject({
      type: 'POST_REQUEST',
      text: '',
      platforms: ['x'],
      images: [{ name: 'photo.png', type: 'image/png', data: 'AA==', alt: 'alt text', bytes: 1 }],
      autoPost: false,
    });
  });

  it('builds a text and image request without leaking default options', async () => {
    await expect(buildPostRequest({
      text: 'caption',
      platforms: ['threads'],
      images: [{
        name: 'photo.png',
        type: 'image/png',
        data: 'AA==',
        previewUrl: 'blob:photo',
      }],
      video: null,
      imageAlts: [],
      autoPost: true,
      cw: '',
      visibility: 'public',
      trimToS: null,
    })).resolves.toMatchObject({
      type: 'POST_REQUEST',
      text: 'caption',
      platforms: ['threads'],
      images: [{ name: 'photo.png', type: 'image/png', data: 'AA==', bytes: 1 }],
      autoPost: true,
      cw: undefined,
      visibility: undefined,
      trimVideoToSeconds: undefined,
    });
  });

  it('keeps video metadata and explicit posting options', async () => {
    await expect(buildPostRequest({
      text: '',
      platforms: ['youtube'],
      images: [],
      video: {
        name: 'clip.mp4',
        type: 'video/mp4',
        data: 'AA==',
        durationS: 12,
        previewUrl: 'blob:test',
      },
      imageAlts: [],
      autoPost: true,
      cw: 'spoiler',
      visibility: 'private',
      trimToS: 10,
    })).resolves.toMatchObject({
      type: 'POST_REQUEST',
      platforms: ['youtube'],
      images: [{ name: 'clip.mp4', type: 'video/mp4', data: 'AA==', durationS: 12, bytes: 1 }],
      autoPost: true,
      cw: 'spoiler',
      visibility: 'private',
      trimVideoToSeconds: 10,
    });
  });
});
