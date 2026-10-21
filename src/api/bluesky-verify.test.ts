import { afterEach, describe, expect, it, vi } from 'vitest';
import { verifyBlueskyPost } from './bluesky-verify';

function stubXrpc(embed: unknown): void {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url.includes('resolveHandle')) return new Response(JSON.stringify({ did: 'did:plc:test' }));
    return new Response(JSON.stringify({
      thread: { post: { record: { text: 'animated gif post', embed } } },
    }));
  }));
}

describe('verifyBlueskyPost', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('accepts a GIF image that Bluesky converted into a gif-presentation video', async () => {
    stubXrpc({
      $type: 'app.bsky.embed.video',
      presentation: 'gif',
      video: { $type: 'blob', mimeType: 'video/mp4' },
    });

    const result = await verifyBlueskyPost(
      'https://bsky.app/profile/alice.test/post/abc',
      { text: 'animated gif post', hasImages: true },
    );

    expect(result.verified).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it('still reports a missing image when the embed is absent', async () => {
    stubXrpc(undefined);

    const result = await verifyBlueskyPost(
      'https://bsky.app/profile/alice.test/post/abc',
      { text: 'animated gif post', hasImages: true },
    );

    expect(result.issues.map((i) => i.kind)).toContain('image-missing');
  });
});
