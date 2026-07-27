import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { verifyBlueskyPost } from '../api/bluesky-verify';
import { verifyMastodonPost } from '../api/mastodon-verify';
import { verifyMisskeyPost } from '../api/misskey-verify';
import {
  cleanGenericDescription,
  cleanInstagramDescription,
  cleanThreadsDescription,
  cleanXDescription,
  cleanYouTubeDescription,
  judgeInstagramImage,
  judgeXImage,
  verifyViaOg,
} from '../utils/post-verify-og';
import type { VerifyExpectation, VerifyResult } from '../utils/post-verify';
import type { PlatformId } from '../types/platform';
import { runVerify } from './platform-strategies';

const mocks = vi.hoisted(() => {
  const ok = (): VerifyResult => ({ verified: true, issues: [] });
  return {
    verifyBluesky: vi.fn(async () => ok()),
    verifyMastodon: vi.fn(async () => ok()),
    verifyMisskey: vi.fn(async () => ok()),
    verifyViaOg: vi.fn(async () => ok()),
  };
});

vi.mock('../api/bluesky-verify', () => ({
  verifyBlueskyPost: mocks.verifyBluesky,
}));

vi.mock('../api/mastodon-verify', () => ({
  verifyMastodonPost: mocks.verifyMastodon,
}));

vi.mock('../api/misskey-verify', () => ({
  verifyMisskeyPost: mocks.verifyMisskey,
}));

vi.mock('../utils/post-verify-og', async (importOriginal) => ({
  ...await importOriginal<typeof import('../utils/post-verify-og')>(),
  verifyViaOg: mocks.verifyViaOg,
}));

const expected: VerifyExpectation = {
  text: 'hello',
  hasImages: false,
};

describe('verification strategy routing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('routes federated platforms to their public API verifiers', async () => {
    await runVerify('bluesky', 'https://example.test/bluesky', expected);
    await runVerify('mastodon', 'https://example.test/mastodon', expected);
    await runVerify('misskey', 'https://example.test/misskey', expected);

    expect(vi.mocked(verifyBlueskyPost)).toHaveBeenCalledOnce();
    expect(vi.mocked(verifyMastodonPost)).toHaveBeenCalledOnce();
    expect(vi.mocked(verifyMisskeyPost)).toHaveBeenCalledOnce();
    expect(vi.mocked(verifyViaOg)).not.toHaveBeenCalled();
  });

  it('preserves each OG platform cleaner and image judge', async () => {
    const cases: Array<[
      PlatformId,
      typeof cleanGenericDescription,
      typeof judgeXImage | undefined,
    ]> = [
      ['x', cleanXDescription, judgeXImage],
      ['instagram', cleanInstagramDescription, judgeInstagramImage],
      ['threads', cleanThreadsDescription, undefined],
      ['tumblr', cleanGenericDescription, undefined],
      ['pixiv', cleanGenericDescription, undefined],
      ['deviantart', cleanGenericDescription, undefined],
      ['tiktok', cleanGenericDescription, undefined],
      ['youtube', cleanYouTubeDescription, undefined],
    ];

    for (const [platform, cleanDescription, judgeImage] of cases) {
      await runVerify(platform, `https://example.test/${platform}`, expected);
      expect(vi.mocked(verifyViaOg)).toHaveBeenLastCalledWith(
        `https://example.test/${platform}`,
        expected,
        { cleanDescription, judgeImage },
      );
    }

    expect(vi.mocked(verifyViaOg)).toHaveBeenCalledTimes(cases.length);
  });

  it.each([
    ['x', { ...expected }, true],
    ['tiktok', { ...expected }, true],
    ['threads', { ...expected, hasImages: true }, false],
  ] as const)('preserves forced DOM fallback policy for %s', async (platform, expectation, withWarning) => {
    vi.useFakeTimers();
    vi.mocked(verifyViaOg).mockResolvedValueOnce({
      verified: true,
      issues: withWarning
        ? [{ kind: 'caption-missing', message: 'warning', severity: 'warn' }]
        : [],
    });
    const create = vi.fn(async () => ({ id: 42 }));
    const sendMessage = vi.fn(async () => ({
      type: 'VERIFY_POST_DOM_RESULT',
      ogDescription: 'hello',
      bodyExcerpt: 'hello',
      ogImage: '',
      hasImage: true,
    }));
    const remove = vi.fn(async () => undefined);
    vi.stubGlobal('browser', { tabs: { create, sendMessage, remove } });

    const pending = runVerify(platform, `https://example.test/${platform}`, expectation);
    await vi.runAllTimersAsync();
    await expect(pending).resolves.toMatchObject({ verified: true });
    expect(create).toHaveBeenCalledOnce();
    expect(sendMessage).toHaveBeenCalledOnce();
    expect(remove).toHaveBeenCalledWith(42);
  });
});
