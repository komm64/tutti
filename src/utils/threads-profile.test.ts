import { Window } from 'happy-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchLatestThreadsPostUrl, findLatestThreadsPostUrlInDocument, normalizeThreadsPostUrl } from './threads-profile';
import { log } from './logger';

const ORIGIN = 'https://www.threads.com';

describe('Threads profile capture', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('filters foreign accounts/hosts and preserves the first matching profile link', () => {
    const doc = new Window().document;
    doc.body.innerHTML = `
      <a href="https://example.com/@owner.name/post/wrong-host">foreign</a>
      <a href="/@ownerXname/post/wrong-account">similar account</a>
      <a href="/@OWNER.name/post/latest?source=profile">latest</a>
      <a href="/@owner.name/post/older">older</a>`;

    expect(findLatestThreadsPostUrlInDocument(doc as unknown as Document, 'owner.name', ORIGIN))
      .toBe(`${ORIGIN}/@OWNER.name/post/latest`);
  });

  it('canonicalizes legacy post URLs without accepting non-post routes', () => {
    expect(normalizeThreadsPostUrl('https://www.threads.net/@owner/post/id?x=1#reply', ORIGIN))
      .toBe(`${ORIGIN}/@owner/post/id`);
    expect(normalizeThreadsPostUrl('/@owner', ORIGIN)).toBeUndefined();
    expect(normalizeThreadsPostUrl('https://threads.com.evil.test/@owner/post/id', ORIGIN))
      .toBeUndefined();
  });

  it('returns the profile URL after reading its complete response', async () => {
    vi.stubGlobal('DOMParser', new Window().DOMParser);
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => '<a href="/@owner/post/latest">post</a>',
    });
    vi.stubGlobal('fetch', fetch);

    await expect(fetchLatestThreadsPostUrl('owner')).resolves.toBe(`${ORIGIN}/@owner/post/latest`);
    expect(fetch).toHaveBeenCalledWith(`${ORIGIN}/@owner`, expect.objectContaining({ credentials: 'include' }));
  });

  it('aborts at the deadline even if headers arrived but the body is stalled', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('DOMParser', new Window().DOMParser);
    vi.spyOn(log, 'warn').mockImplementation(() => undefined);
    let signal: AbortSignal | undefined;
    vi.stubGlobal('fetch', vi.fn(async (_url, options) => {
      signal = options.signal;
      return { ok: true, text: () => new Promise<string>(() => {}) };
    }));

    const result = fetchLatestThreadsPostUrl('owner', 5_000);
    await vi.advanceTimersByTimeAsync(4_999);
    expect(signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);

    await expect(result).resolves.toBeUndefined();
    expect(signal?.aborted).toBe(true);
  });
});
