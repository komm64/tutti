import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  captureStoredApiPostUrl,
  storedApiCaptureKey,
} from './post-url-stored-api';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('stored API post URL capture', () => {
  it('owns the four page-world capture storage keys', () => {
    expect(storedApiCaptureKey('instagram')).toBe('tutti:ig-latest-post');
    expect(storedApiCaptureKey('mastodon')).toBe('tutti:mastodon-latest-post');
    expect(storedApiCaptureKey('threads')).toBe('tutti:threads-latest-post');
    expect(storedApiCaptureKey('tumblr')).toBe('tutti:tumblr-latest-post');
    expect(storedApiCaptureKey('x')).toBeUndefined();
  });

  it('reads a fresh matching record in the MAIN world', async () => {
    const executeScript = vi.fn(async () => [{
      result: JSON.stringify({
        url: 'https://www.threads.com/@komm64/post/ABC_def_123',
        capturedAt: Date.now(),
      }),
    }]);
    vi.stubGlobal('browser', { scripting: { executeScript } });
    const debug = vi.fn();

    await expect(captureStoredApiPostUrl(
      'threads',
      42,
      'hello',
      debug,
    )).resolves.toBe('https://www.threads.com/@komm64/post/ABC_def_123');

    expect(executeScript).toHaveBeenCalledWith(expect.objectContaining({
      target: { tabId: 42 },
      args: ['tutti:threads-latest-post'],
      world: 'MAIN',
    }));
    expect(debug).toHaveBeenCalledWith(
      'URL captured via stored API response: ' +
      'https://www.threads.com/@komm64/post/ABC_def_123',
    );
  });

  it('returns immediately for platforms without a stored API strategy', async () => {
    const executeScript = vi.fn();
    vi.stubGlobal('browser', { scripting: { executeScript } });

    await expect(captureStoredApiPostUrl(
      'bluesky',
      42,
      'hello',
      vi.fn(),
    )).resolves.toBeUndefined();
    expect(executeScript).not.toHaveBeenCalled();
  });
});
