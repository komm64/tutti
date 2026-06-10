import { describe, expect, it } from 'vitest';
import { postViaSession } from './bluesky';

describe('Bluesky API client', () => {
  it('rejects video attachments instead of posting text-only', async () => {
    const result = await postViaSession(
      { accessJwt: 'jwt', did: 'did:plc:alice', handle: 'alice.test' },
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

    expect(result.success).toBe(false);
    expect(result.error).toContain('Bluesky API video posting is not supported');
  });
});
