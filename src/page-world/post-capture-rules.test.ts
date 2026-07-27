import { describe, expect, it, vi } from 'vitest';
import instagramFixture from '../fixtures/post-capture/instagram-configure.json';
import mastodonFixture from '../fixtures/post-capture/mastodon-status.json';
import threadsFixture from '../fixtures/post-capture/threads-create.json';
import tumblrFixture from '../fixtures/post-capture/tumblr-create.json';
import xFixture from '../fixtures/post-capture/x-create-tweet.json';
import type { ObservedNetworkRequest } from './network-observer';
import {
  POST_CAPTURE_RULES,
  createPagePostCaptureRules,
  type PostCapturePendingState,
} from './post-capture-rules';

const FIXTURES = [
  {
    platform: 'instagram',
    host: 'www.instagram.com',
    origin: 'https://www.instagram.com',
    fixture: instagramFixture,
    pending: { caption: 'fallback caption' },
  },
  {
    platform: 'mastodon',
    host: 'mastodon.social',
    origin: 'https://mastodon.social',
    fixture: mastodonFixture,
    pending: { textHash: 'mastodon-hash' },
  },
  {
    platform: 'tumblr',
    host: 'www.tumblr.com',
    origin: 'https://www.tumblr.com',
    fixture: tumblrFixture,
    pending: { textHash: 'tumblr-hash', blogName: 'fixture' },
  },
  {
    platform: 'threads',
    host: 'www.threads.com',
    origin: 'https://www.threads.com',
    fixture: threadsFixture,
    pending: { textHash: 'threads-hash', username: 'fixture' },
  },
  {
    platform: 'x',
    host: 'x.com',
    origin: 'https://x.com',
    fixture: xFixture,
    pending: {},
  },
] as const;

describe('page-world post capture rules', () => {
  it('defines exactly one pure rule per capture platform', () => {
    expect(POST_CAPTURE_RULES.map(({ id }) => id)).toEqual([
      'instagram',
      'mastodon',
      'tumblr',
      'threads',
      'x',
    ]);
    expect(new Set(POST_CAPTURE_RULES.map(({ id }) => id)).size)
      .toBe(POST_CAPTURE_RULES.length);
  });

  for (const testCase of FIXTURES) {
    it.each(['fetch', 'xhr'] as const)(
      `matches and captures the ${testCase.platform} fixture over %s`,
      (transport) => {
        const captured = vi.fn();
        const rules = createPagePostCaptureRules({
          host: testCase.host,
          origin: testCase.origin,
          readPending: () => testCase.pending as PostCapturePendingState,
          onCaptured: captured,
        });

        expect(rules).toHaveLength(1);
        const request = {
          transport,
          url: testCase.fixture.request.url,
          method: testCase.fixture.request.method,
          body: 'body' in testCase.fixture.request
            ? testCase.fixture.request.body
            : undefined,
        } satisfies ObservedNetworkRequest;
        const preparation = rules[0]!.prepare(request);
        expect(preparation).not.toBeNull();
        rules[0]!.capture(
          testCase.fixture.response,
          request,
          preparation!.context,
        );

        expect(captured).toHaveBeenCalledWith({
          platform: testCase.platform,
          record: expect.objectContaining(testCase.fixture.expected),
        });
      },
    );
  }

  it('repairs an empty Instagram caption without changing a populated one', () => {
    const rule = createRule('www.instagram.com', 'https://www.instagram.com', {
      caption: 'fallback caption',
    });
    const emptyCaption = request(
      instagramFixture.request.url,
      'upload_id=1&caption=',
    );
    const existingCaption = request(
      instagramFixture.request.url,
      'upload_id=1&caption=already%20there',
    );

    expect(rule.prepare(emptyCaption)?.body).toContain('caption=fallback%20caption');
    expect(rule.prepare(existingCaption)).not.toHaveProperty('body');
  });

  it('rejects non-post and read-only Threads traffic', () => {
    const rule = createRule('www.threads.com', 'https://www.threads.com', {
      textHash: 'hash',
      username: 'fixture',
    });

    expect(rule.prepare({
      ...request(threadsFixture.request.url, threadsFixture.request.body),
      method: 'GET',
    })).toBeNull();
    expect(rule.prepare(request(
      threadsFixture.request.url,
      'operation=timeline_feed&query=viewer',
    ))).toBeNull();
  });

  it('does not capture Threads responses without pending Tutti state', () => {
    const captured = vi.fn();
    const [rule] = createPagePostCaptureRules({
      host: 'www.threads.com',
      origin: 'https://www.threads.com',
      readPending: () => ({}),
      onCaptured: captured,
    });
    const observed = request(threadsFixture.request.url, threadsFixture.request.body);
    const preparation = rule!.prepare(observed);

    rule!.capture(threadsFixture.response, observed, preparation!.context);

    expect(captured).not.toHaveBeenCalled();
  });

  it('keeps rules isolated to their supported host', () => {
    expect(createPagePostCaptureRules({
      host: 'bsky.app',
      origin: 'https://bsky.app',
      readPending: () => ({}),
      onCaptured: vi.fn(),
    })).toEqual([]);
  });
});

function createRule(
  host: string,
  origin: string,
  pending: PostCapturePendingState,
) {
  return createPagePostCaptureRules({
    host,
    origin,
    readPending: () => pending,
    onCaptured: vi.fn(),
  })[0]!;
}

function request(url: string, body?: unknown): ObservedNetworkRequest {
  return {
    transport: 'fetch',
    url,
    method: 'POST',
    body,
  };
}
