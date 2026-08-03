// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  findReplyButton,
  isPlatformPostDetailUrl,
  openReplyComposerIfOnPostPage,
  parseMastodonStatusIdFromUrl,
} from './reply-compose';

vi.mock('./web-action-pacing', () => ({
  clickElementWithPacing: vi.fn(async (element: HTMLElement) => { element.click(); }),
}));

function markVisible(el: HTMLElement): void {
  Object.defineProperty(el, 'getClientRects', {
    value: () => [{ width: 10, height: 10 }],
    configurable: true,
  });
}

describe('reply compose helpers', () => {
  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
    history.replaceState({}, '', '/');
  });

  it('detects Mastodon and Threads post detail URLs', () => {
    expect(isPlatformPostDetailUrl('mastodon', 'https://mastodon.social/@alice/1234567890')).toBe(true);
    expect(isPlatformPostDetailUrl('mastodon', 'https://mastodon.social/share?text=hello')).toBe(false);
    expect(isPlatformPostDetailUrl('threads', 'https://www.threads.com/@alice/post/ABC-def_123')).toBe(true);
    expect(isPlatformPostDetailUrl('threads', 'https://www.threads.com/intent/post?text=hello')).toBe(false);
  });

  it('parses Mastodon status ids for API reply posting', () => {
    expect(parseMastodonStatusIdFromUrl('https://mastodon.social/@alice/1234567890')).toBe('1234567890');
    expect(parseMastodonStatusIdFromUrl('https://mastodon.social/users/alice/statuses/1234567890')).toBe('1234567890');
    expect(parseMastodonStatusIdFromUrl('https://mastodon.social/home')).toBeUndefined();
  });

  it('finds enabled reply buttons by aria-label', () => {
    document.body.innerHTML = `
      <button aria-label="Like"></button>
      <button aria-label="Reply"></button>
    `;
    document.querySelectorAll<HTMLElement>('button').forEach(markVisible);

    expect(findReplyButton('threads')?.getAttribute('aria-label')).toBe('Reply');
  });

  it('skips disabled reply buttons', () => {
    document.body.innerHTML = `
      <button aria-label="Reply" aria-disabled="true"></button>
      <button aria-label="返信"></button>
    `;
    document.querySelectorAll<HTMLElement>('button').forEach(markVisible);

    expect(findReplyButton('mastodon')?.getAttribute('aria-label')).toBe('返信');
  });

  it('next waits directly for the reply editor without the legacy fixed delay', async () => {
    vi.useFakeTimers();
    history.replaceState({}, '', '/@alice/1234567890');
    document.body.innerHTML = '<button aria-label="Reply"></button>';
    const button = document.querySelector<HTMLButtonElement>('button')!;
    markVisible(button);
    button.addEventListener('click', () => {
      const textarea = document.createElement('textarea');
      textarea.className = 'reply-editor';
      document.body.appendChild(textarea);
    });

    await expect(openReplyComposerIfOnPostPage(
      'mastodon',
      '.reply-editor',
      { implementationPath: 'next' },
    )).resolves.toBe(true);
  });
});
