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
});
