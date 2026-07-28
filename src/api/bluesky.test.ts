import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { postThreadViaSession, postViaSession } from './bluesky';

describe('Bluesky API client', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn(async (url: string) => {
      if (url.includes('/xrpc/com.atproto.server.getServiceAuth')) {
        return new Response(JSON.stringify({ token: 'service-token' }), { status: 200 });
      }
      if (url.includes('/xrpc/app.bsky.video.uploadVideo')) {
        return new Response(JSON.stringify({
          jobId: 'job-1',
          blob: {
            $type: 'blob',
            ref: { $link: 'blobcid' },
            mimeType: 'video/mp4',
            size: 1,
          },
        }), { status: 200 });
      }
      if (url.endsWith('/xrpc/com.atproto.repo.createRecord')) {
        return new Response(JSON.stringify({
          uri: 'at://did:plc:alice/app.bsky.feed.post/3abc',
          cid: 'recordcid',
        }), { status: 200 });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchSpy);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('posts video attachments through app.bsky.embed.video', async () => {
    const jwtWithPdsAudience = `head.${btoa(JSON.stringify({ aud: 'did:web:pds.example' }))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')}.sig`;
    const result = await postViaSession(
      { accessJwt: jwtWithPdsAudience, did: 'did:plc:alice', handle: 'alice.test' },
      {
        text: 'hello video',
        images: [{
          name: 'clip.mp4',
          type: 'video/mp4',
          data: 'AA==',
          durationS: 1,
        }],
      },
    );

    expect(result).toMatchObject({
      success: true,
      postUrl: 'https://bsky.app/profile/alice.test/post/3abc',
      uri: 'at://did:plc:alice/app.bsky.feed.post/3abc',
      cid: 'recordcid',
    });
    const serviceAuthCall = fetchSpy.mock.calls.find(([u]) => String(u).includes('/xrpc/com.atproto.server.getServiceAuth'));
    expect(serviceAuthCall?.[1]?.headers).toMatchObject({
      Authorization: `Bearer ${jwtWithPdsAudience}`,
    });
    expect(String(serviceAuthCall?.[0])).toContain('aud=did%3Aweb%3Apds.example');
    expect(String(serviceAuthCall?.[0])).toContain('lxm=com.atproto.repo.uploadBlob');
    const uploadCall = fetchSpy.mock.calls.find(([u]) => String(u).includes('/xrpc/app.bsky.video.uploadVideo'));
    expect(uploadCall?.[1]?.headers).toMatchObject({
      'Content-Type': 'video/mp4',
      Authorization: 'Bearer service-token',
    });
    expect(String(uploadCall?.[0])).toContain('did=did%3Aplc%3Aalice');
    expect(String(uploadCall?.[0])).toContain('name=clip.mp4');
    expect(fetchSpy.mock.calls.some(([u]) => String(u).endsWith('/xrpc/com.atproto.repo.uploadBlob'))).toBe(false);
    const createCall = fetchSpy.mock.calls.find(([u]) => String(u).endsWith('/xrpc/com.atproto.repo.createRecord'));
    expect(createCall).toBeDefined();
    const body = JSON.parse(String(createCall![1]!.body));
    expect(body.record.embed).toMatchObject({
      $type: 'app.bsky.embed.video',
      video: {
        $type: 'blob',
        ref: { $link: 'blobcid' },
        mimeType: 'video/mp4',
        size: 1,
      },
    });
    expect(body.record.embed.images).toBeUndefined();
  });

  it('rejects mixed video and images because Bluesky has no combined media embed', async () => {
    const result = await postViaSession(
      { accessJwt: 'jwt', did: 'did:plc:alice', handle: 'alice.test' },
      {
        text: 'mixed media',
        images: [
          { name: 'clip.mp4', type: 'video/mp4', data: 'AA==', durationS: 1 },
          { name: 'photo.png', type: 'image/png', data: 'AA==' },
        ],
      },
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('cannot combine video and images');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('creates an entire thread in one session with root and parent chaining', async () => {
    let createIndex = 0;
    fetchSpy.mockImplementation(async (url: string) => {
      if (url.endsWith('/xrpc/com.atproto.repo.createRecord')) {
        createIndex += 1;
        return new Response(JSON.stringify({
          uri: `at://did:plc:alice/app.bsky.feed.post/chunk${createIndex}`,
          cid: `cid${createIndex}`,
        }), { status: 200 });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });

    const result = await postThreadViaSession(
      { accessJwt: 'jwt', did: 'did:plc:alice', handle: 'alice.test' },
      { chunks: ['first', 'second', 'third'] },
    );

    expect(result).toEqual({
      success: true,
      postUrl: 'https://bsky.app/profile/alice.test/post/chunk3',
    });
    const createCalls = fetchSpy.mock.calls
      .filter(([url]) => String(url).endsWith('/xrpc/com.atproto.repo.createRecord'));
    expect(createCalls).toHaveLength(3);
    const records = createCalls.map(([, init]) => JSON.parse(String(init?.body)).record);
    expect(records[0].reply).toBeUndefined();
    expect(records[1].reply).toEqual({
      root: {
        uri: 'at://did:plc:alice/app.bsky.feed.post/chunk1',
        cid: 'cid1',
      },
      parent: {
        uri: 'at://did:plc:alice/app.bsky.feed.post/chunk1',
        cid: 'cid1',
      },
    });
    expect(records[2].reply).toEqual({
      root: {
        uri: 'at://did:plc:alice/app.bsky.feed.post/chunk1',
        cid: 'cid1',
      },
      parent: {
        uri: 'at://did:plc:alice/app.bsky.feed.post/chunk2',
        cid: 'cid2',
      },
    });
  });

  it('marks a thread as uncertain when a later chunk fails after the root exists', async () => {
    let createIndex = 0;
    fetchSpy.mockImplementation(async (url: string) => {
      if (!url.endsWith('/xrpc/com.atproto.repo.createRecord')) {
        throw new Error(`unexpected fetch: ${url}`);
      }
      createIndex += 1;
      if (createIndex === 2) {
        return new Response('rate limited', { status: 429 });
      }
      return new Response(JSON.stringify({
        uri: 'at://did:plc:alice/app.bsky.feed.post/root',
        cid: 'rootcid',
      }), { status: 200 });
    });

    const result = await postThreadViaSession(
      { accessJwt: 'jwt', did: 'did:plc:alice', handle: 'alice.test' },
      { chunks: ['first', 'second'] },
    );

    expect(result).toMatchObject({
      success: false,
      uncertain: true,
      postUrl: 'https://bsky.app/profile/alice.test/post/root',
    });
    expect(result.error).toContain('chunk 2/2');
  });
});
