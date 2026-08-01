// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchMisskeyRecentNoteUrl } from './misskey-recent-note-url';

afterEach(() => {
  localStorage.clear();
  vi.unstubAllGlobals();
});

describe('Misskey recent note URL capture', () => {
  it('uses the current users/notes endpoint with the signed-in account id', async () => {
    localStorage.setItem('account', JSON.stringify({ id: 'user-1', i: 'secret-token' }));
    const createdAt = new Date().toISOString();
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify([{
      id: 'note-1',
      text: 'hello   Surface',
      createdAt,
    }]), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('location', { origin: 'https://misskey.io' });

    await expect(fetchMisskeyRecentNoteUrl('hello Surface', Date.now() - 1000))
      .resolves.toBe('https://misskey.io/notes/note-1');
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/users/notes');
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      i: 'secret-token',
      userId: 'user-1',
      limit: 10,
    });
  });

  it('does not query notes without both token and account id', async () => {
    localStorage.setItem('account', JSON.stringify({ i: 'secret-token' }));
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchMisskeyRecentNoteUrl('hello')).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
