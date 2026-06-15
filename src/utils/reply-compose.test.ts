// @vitest-environment happy-dom

import { describe, expect, it } from 'vitest';
import {
  continuationNeedsReplyUrl,
  findReplyButton,
  isPlatformPostDetailUrl,
  parseMastodonStatusIdFromUrl,
} from './reply-compose';

function markVisible(el: HTMLElement): void {
  Object.defineProperty(el, 'getClientRects', {
    value: () => [{ width: 10, height: 10 }],
    configurable: true,
  });
}

describe('reply compose helpers', () => {
  it('requires a captured parent URL for continuation platforms', () => {
    expect(continuationNeedsReplyUrl('x')).toBe(true);
    expect(continuationNeedsReplyUrl('mastodon')).toBe(true);
    expect(continuationNeedsReplyUrl('threads')).toBe(true);
    expect(continuationNeedsReplyUrl('bluesky')).toBe(false);
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
});
