import { Window } from 'happy-dom';
import { describe, expect, it } from 'vitest';
import {
  extractInstagramPostRecord,
  extractTumblrPostRecord,
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
});
