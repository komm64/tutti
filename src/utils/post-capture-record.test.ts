import { Window } from 'happy-dom';
import { describe, expect, it } from 'vitest';
import {
  extractInstagramPostRecord,
  extractMastodonPostRecord,
  extractThreadsPostRecord,
  extractTumblrPostRecord,
  findLatestTumblrPostUrlInDocument,
  findTumblrPostUrlInDocument,
  hashCaptureText,
  prepareInstagramConfigureBody,
  readFreshCapturedPost,
} from './post-capture-record';

describe('post capture records', () => {
  it('injects a missing Instagram caption into form configure bodies', () => {
    const prepared = prepareInstagramConfigureBody(
      'upload_id=1&caption=&children_metadata=%5B%5D',
      'hello from Tutti',
    );

    expect(prepared.changed).toBe(true);
    expect(prepared.body).toContain('caption=hello%20from%20Tutti');
    expect(prepared.textHash).toBe(hashCaptureText('hello from Tutti'));
  });

  it('does not overwrite a non-empty Instagram caption', () => {
    const body = 'upload_id=1&caption=already%20there';
    const prepared = prepareInstagramConfigureBody(body, 'replacement');

    expect(prepared.changed).toBe(false);
    expect(prepared.body).toBe(body);
    expect(prepared.textHash).toBe(hashCaptureText('already there'));
  });

  it('extracts Instagram post URLs from configure responses', () => {
    const record = extractInstagramPostRecord(
      { media: { code: 'ABC_def-1', product_type: 'feed' } },
      'hash',
      100,
    );

    expect(record).toEqual({
      url: 'https://www.instagram.com/p/ABC_def-1/',
      code: 'ABC_def-1',
      capturedAt: 100,
      textHash: 'hash',
    });
  });

  it('extracts Mastodon post URLs from status responses', () => {
    const record = extractMastodonPostRecord(
      {
        id: '116731234567890123',
        url: 'https://mastodon.social/@komm64/116731234567890123?utm=ignored',
      },
      'hash',
      100,
    );

    expect(record).toEqual({
      url: 'https://mastodon.social/@komm64/116731234567890123',
      id: '116731234567890123',
      capturedAt: 100,
      textHash: 'hash',
    });
  });

  it('extracts Mastodon federated URI fallbacks from status responses', () => {
    const record = extractMastodonPostRecord(
      {
        id: '116731234567890124',
        uri: 'https://mastodon.social/users/komm64/statuses/116731234567890124',
      },
      undefined,
      100,
    );

    expect(record?.url).toBe('https://mastodon.social/users/komm64/statuses/116731234567890124');
    expect(record?.id).toBe('116731234567890124');
  });

  it('extracts Tumblr post URLs from API responses', () => {
    const record = extractTumblrPostRecord(
      { response: { id: 123, blog: { name: 'komm64' } } },
      undefined,
      'hash',
      100,
    );

    expect(record).toEqual({
      url: 'https://www.tumblr.com/komm64/123',
      id: '123',
      blogName: 'komm64',
      capturedAt: 100,
      textHash: 'hash',
    });
  });

  it('normalizes Tumblr subdomain post URLs', () => {
    const record = extractTumblrPostRecord(
      { response: { post_url: 'https://komm64.tumblr.com/post/456/example' } },
      undefined,
      undefined,
      100,
    );

    expect(record?.url).toBe('https://www.tumblr.com/komm64/456');
  });

  it('extracts Tumblr post IDs from alternate API response keys', () => {
    const record = extractTumblrPostRecord(
      { response: { post_id_string: '789' } },
      'komm64.tumblr.com',
      undefined,
      100,
    );

    expect(record?.url).toBe('https://www.tumblr.com/komm64/789');
  });

  it('uses the pending Tumblr blog name when the create response only has an id', () => {
    const record = extractTumblrPostRecord(
      { response: { id_string: '9876543210' } },
      'komm64',
      'hash',
      100,
    );

    expect(record).toEqual({
      url: 'https://www.tumblr.com/komm64/9876543210',
      id: '9876543210',
      blogName: 'komm64',
      capturedAt: 100,
      textHash: 'hash',
    });
  });

  it('extracts Threads post URLs from GraphQL-like responses', () => {
    const record = extractThreadsPostRecord(
      {
        data: {
          create_post: {
            post: {
              code: 'DZaBc_12345',
              user: { username: 'komm64' },
            },
          },
        },
      },
      undefined,
      'hash',
      100,
    );

    expect(record).toEqual({
      url: 'https://www.threads.com/@komm64/post/DZaBc_12345',
      code: 'DZaBc_12345',
      username: 'komm64',
      capturedAt: 100,
      textHash: 'hash',
    });
  });

  it('extracts Threads post URLs from URL fields', () => {
    const record = extractThreadsPostRecord(
      { response: { permalink: 'https://www.threads.net/@komm64/post/DZxyz_987?x=1' } },
      undefined,
      undefined,
      100,
    );

    expect(record?.url).toBe('https://www.threads.com/@komm64/post/DZxyz_987');
  });

  it('does not build Threads URLs from generic status codes', () => {
    const record = extractThreadsPostRecord(
      { response: { code: 'SUCCESS' } },
      'komm64',
      undefined,
      100,
    );

    expect(record).toBeUndefined();
  });

  it('does not build Threads URLs from a code plus fallback username only', () => {
    const record = extractThreadsPostRecord(
      { response: { code: 'DZaBc_12345' } },
      'komm64',
      undefined,
      100,
    );

    expect(record).toBeUndefined();
  });

  it('rejects fresh records with a mismatched text hash', () => {
    const raw = JSON.stringify({
      url: 'https://example.com/post/1',
      capturedAt: 100,
      textHash: hashCaptureText('old text'),
    });

    expect(readFreshCapturedPost(raw, 'new text', 10_000, 200)).toBeUndefined();
  });

  it('skips pinned Tumblr profile matches and returns the matching normal post', () => {
    const window = new Window();
    window.document.body.innerHTML = `
      <article>
        <div>Pinned post</div>
        <a href="/komm64/111">Pinned permalink</a>
        <p>Tutti beta announcement</p>
      </article>
      <article>
        <a href="/komm64/222">Normal permalink</a>
        <p>Tutti beta announcement</p>
      </article>
    `;

    expect(
      findTumblrPostUrlInDocument(
        window.document as unknown as Document,
        'komm64',
        'Tutti beta announcement',
        'https://www.tumblr.com',
      ),
    ).toBe('https://www.tumblr.com/komm64/222');
  });

  it('returns the latest non-pinned Tumblr post for media-only fallback', () => {
    const window = new Window();
    window.document.body.innerHTML = `
      <article>
        <div>Pinned post</div>
        <a href="/komm64/111">Pinned permalink</a>
      </article>
      <article>
        <a href="/komm64/222">Latest normal permalink</a>
        <img src="https://example.test/image.jpg" />
      </article>
      <article>
        <a href="/komm64/333">Older permalink</a>
      </article>
    `;

    expect(
      findLatestTumblrPostUrlInDocument(
        window.document as unknown as Document,
        'komm64',
        'https://www.tumblr.com',
      ),
    ).toBe('https://www.tumblr.com/komm64/222');
  });

  it('skips a known pre-submit Tumblr URL when finding latest media-only post', () => {
    const window = new Window();
    window.document.body.innerHTML = `
      <article>
        <a href="/komm64/222">New permalink</a>
      </article>
      <article>
        <a href="/komm64/111">Old permalink</a>
      </article>
    `;

    expect(
      findLatestTumblrPostUrlInDocument(
        window.document as unknown as Document,
        'komm64',
        'https://www.tumblr.com',
        ['https://www.tumblr.com/komm64/222'],
      ),
    ).toBe('https://www.tumblr.com/komm64/111');
  });
});
