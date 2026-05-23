/**
 * Mastodon API client の post body 構築 unit test (v0.4.87 の alt / CW / visibility が
 * 正しく FormData / JSON body に反映されるか)。
 * fetch を mock してリクエスト内容を assert。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { postViaApi } from './mastodon';

const creds = { instance: 'https://example.social', accessToken: 'test-token' };

describe('mastodon postViaApi (v0.4.87)', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    fetchSpy = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/api/v2/media')) {
        return new Response(JSON.stringify({ id: 'mid-123' }), { status: 200 });
      }
      if (url.endsWith('/api/v1/statuses')) {
        return new Response(JSON.stringify({ url: 'https://example.social/@u/1' }), { status: 200 });
      }
      throw new Error(`unexpected fetch: ${url} ${init?.method}`);
    });
    vi.stubGlobal('fetch', fetchSpy);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends CW (spoiler_text) and visibility in statuses body', async () => {
    const result = await postViaApi(creds, {
      text: 'hello',
      cw: 'spoilers!',
      visibility: 'unlisted',
    });
    expect(result.success).toBe(true);
    const statusesCall = fetchSpy.mock.calls.find(([u]) => String(u).endsWith('/api/v1/statuses'));
    expect(statusesCall).toBeDefined();
    const body = JSON.parse(String(statusesCall![1]!.body));
    expect(body.status).toBe('hello');
    expect(body.spoiler_text).toBe('spoilers!');
    expect(body.visibility).toBe('unlisted');
  });

  it('omits cw / visibility when not provided (default public)', async () => {
    await postViaApi(creds, { text: 'plain' });
    const statusesCall = fetchSpy.mock.calls.find(([u]) => String(u).endsWith('/api/v1/statuses'));
    const body = JSON.parse(String(statusesCall![1]!.body));
    expect(body.spoiler_text).toBeUndefined();
    expect(body.visibility).toBeUndefined();
  });

  it('sends alt text as media description', async () => {
    await postViaApi(creds, {
      text: 'with image',
      images: [{
        name: 't.jpg',
        type: 'image/jpeg',
        data: 'aGVsbG8=', // base64 "hello"
        alt: 'a test image',
      }],
    });
    const mediaCall = fetchSpy.mock.calls.find(([u]) => String(u).endsWith('/api/v2/media'));
    expect(mediaCall).toBeDefined();
    const fd = mediaCall![1]!.body as FormData;
    expect(fd.get('description')).toBe('a test image');
  });

  it('does not include description form field when alt is empty', async () => {
    await postViaApi(creds, {
      text: 'no alt',
      images: [{
        name: 't.jpg',
        type: 'image/jpeg',
        data: 'aGVsbG8=',
      }],
    });
    const mediaCall = fetchSpy.mock.calls.find(([u]) => String(u).endsWith('/api/v2/media'));
    const fd = mediaCall![1]!.body as FormData;
    expect(fd.get('description')).toBeNull();
  });
});
