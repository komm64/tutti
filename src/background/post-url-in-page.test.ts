// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { capturePostUrlInPage } from './post-url-in-page';

afterEach(() => {
  localStorage.clear();
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
});

describe('in-page post URL capture', () => {
  it('uses the current DeviantArt artwork URL', async () => {
    vi.stubGlobal('location', {
      pathname: '/alice/art/Tutti-Release-123',
      href: 'https://www.deviantart.com/alice/art/Tutti-Release-123',
      origin: 'https://www.deviantart.com',
    });

    await expect(capturePostUrlInPage(
      'deviantart',
      'Tutti release',
      null,
      null,
    )).resolves.toEqual({
      url: 'https://www.deviantart.com/alice/art/Tutti-Release-123',
      trace: [],
    });
  });

  it('captures a fresh X post id with the expected handle', async () => {
    localStorage.setItem('tutti:x-latest-post', JSON.stringify({
      id: '1234567890',
      capturedAt: Date.now(),
    }));

    await expect(capturePostUrlInPage(
      'x',
      'hello',
      '@alice',
      Date.now() - 1000,
    )).resolves.toEqual({
      url: 'https://x.com/alice/status/1234567890',
      trace: [],
    });
  });

  it('keeps Instagram DOM fallback disabled', async () => {
    await expect(capturePostUrlInPage(
      'instagram',
      'hello',
      null,
      null,
    )).resolves.toEqual({
      trace: [
        'instagram URL capture requires configure response; ' +
        'DOM first-link fallback disabled',
      ],
    });
  });
});
