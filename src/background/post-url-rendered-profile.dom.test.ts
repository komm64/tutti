// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { findThreadsPostAfterInPage } from './post-url-rendered-profile';

const SUBMIT = Date.parse('2026-11-19T10:00:00Z');

function post(handle: string, id: string, iso: string): string {
  return `<div><a href="https://www.threads.com/@${handle}/post/${id}"><time datetime="${iso}">now</time></a></div>`;
}

describe('findThreadsPostAfterInPage', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('returns the newest post by the user at or after the submit time', async () => {
    document.body.innerHTML = [
      post('me', 'old', '2026-11-18T09:00:00Z'),
      post('me', 'new', '2026-11-19T10:00:05Z'),
      post('me', 'newer', '2026-11-19T10:00:09Z'),
    ].join('');
    await expect(findThreadsPostAfterInPage('me', SUBMIT, 0)).resolves.toBe(
      'https://www.threads.com/@me/post/newer',
    );
  });

  it('ignores older posts and posts by other accounts', async () => {
    document.body.innerHTML = [
      post('me', 'old', '2026-11-19T09:59:00Z'),
      post('someone', 'repost', '2026-11-19T10:00:30Z'),
    ].join('');
    await expect(findThreadsPostAfterInPage('me', SUBMIT, 0)).resolves.toBeUndefined();
  });

  it('matches the handle case-insensitively', async () => {
    document.body.innerHTML = post('Me.Name', 'a1', '2026-11-19T10:00:01Z');
    await expect(findThreadsPostAfterInPage('me.name', SUBMIT, 0)).resolves.toBe(
      'https://www.threads.com/@Me.Name/post/a1',
    );
  });
});
