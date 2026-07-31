import { describe, expect, it } from 'vitest';
import { extractMediaUploadFailure } from './media-upload-result';

describe('extractMediaUploadFailure', () => {
  it('extracts Tumblr daily media limits from a completed 403 response', () => {
    expect(extractMediaUploadFailure({
      meta: { status: 403, msg: 'Forbidden' },
      errors: [{
        title: 'Forbidden',
        code: 8004,
        detail: "You've exceeded your daily post or media limit. Please try again tomorrow.",
      }],
      response: [],
    })).toBe("You've exceeded your daily post or media limit. Please try again tomorrow.");
  });

  it('does not classify successful upload payloads as failures', () => {
    expect(extractMediaUploadFailure({
      meta: { status: 201, msg: 'Created' },
      message: 'Upload accepted',
      response: [{ url: 'https://media.example/video.mp4' }],
    })).toBeUndefined();
  });

  it('falls back to direct API error messages', () => {
    expect(extractMediaUploadFailure({
      status: 429,
      error: 'Upload quota exceeded',
    })).toBe('Upload quota exceeded');
  });

  it('extracts asynchronous X video processing failures', () => {
    expect(extractMediaUploadFailure({
      processing_info: {
        state: 'failed',
        error: {
          code: 3,
          name: 'InvalidMedia',
          message: 'Unsupported video format',
        },
      },
    })).toBe('Unsupported video format');

    expect(extractMediaUploadFailure({
      data: {
        processing_info: {
          state: 'failed',
          error: { name: 'TranscodeFailed' },
        },
      },
    })).toBe('TranscodeFailed');
  });
});
