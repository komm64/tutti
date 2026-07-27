import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlatformAdapter } from '../adapters/types';
import type { PostResultMessage } from '../messages';
import { createPlatformPoster } from './platform-poster';

const mocks = vi.hoisted(() => ({
  buildLoginRedirectErrorForUrl: vi.fn(() => null),
  buildMissingReceiverLoginError: vi.fn(async () => null),
  capturePostUrlFromTabWithRetry: vi.fn(async () => undefined),
  closeTabSafely: vi.fn(async () => undefined),
  getLastSeenUsers: vi.fn(async () => ({})),
  getSettings: vi.fn(async () => ({ autoOpenPostUrl: 'never' })),
  isMissingReceiverError: vi.fn(() => false),
  maybeResizeImagesForPlatform: vi.fn(async (_adapter, images) => images),
  openOrFocusTab: vi.fn(async () => ({
    tab: { id: 42, url: 'https://social.example/compose' },
    wasCreated: true,
  })),
  prepareMediaForPlatform: vi.fn(async (_adapter, _platform, images) => ({
    ok: true,
    images,
  })),
  resolveAdapter: vi.fn(),
  retryTransientTabAction: vi.fn(async (_label, action) => await action()),
  runVerify: vi.fn(),
  sendPostMessageWhenReady: vi.fn(),
  tryApiPath: vi.fn(),
}));

vi.mock('../storage', () => ({
  getLastSeenUsers: mocks.getLastSeenUsers,
  getSettings: mocks.getSettings,
}));

vi.mock('../utils/logger', () => ({
  log: {
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock('./adapter-resolver', () => ({
  resolveAdapter: mocks.resolveAdapter,
}));

vi.mock('./platform-strategies', async (importOriginal) => ({
  ...await importOriginal<typeof import('./platform-strategies')>(),
  runVerify: mocks.runVerify,
  tryApiPath: mocks.tryApiPath,
}));

vi.mock('./content-dispatch', () => ({
  buildLoginRedirectErrorForUrl: mocks.buildLoginRedirectErrorForUrl,
  buildMissingReceiverLoginError: mocks.buildMissingReceiverLoginError,
  isMissingReceiverError: mocks.isMissingReceiverError,
  sendPostMessageWhenReady: mocks.sendPostMessageWhenReady,
}));

vi.mock('./media-preprocess', () => ({
  maybeResizeImagesForPlatform: mocks.maybeResizeImagesForPlatform,
}));

vi.mock('./platform-media', () => ({
  prepareMediaForPlatform: mocks.prepareMediaForPlatform,
}));

vi.mock('./post-url-capture', () => ({
  capturePostUrlFromTabWithRetry: mocks.capturePostUrlFromTabWithRetry,
}));

vi.mock('./tab-action-retry', () => ({
  retryTransientTabAction: mocks.retryTransientTabAction,
}));

vi.mock('./tab-management', () => ({
  closeTabSafely: mocks.closeTabSafely,
  openOrFocusTab: mocks.openOrFocusTab,
}));

function adapter(id: PlatformAdapter['id'] = 'mastodon'): PlatformAdapter {
  return {
    id,
    name: id,
    charLimit: 500,
    popupOrder: 1,
    defaultSelected: true,
    matchUrl: (url) => url.startsWith('https://social.example/'),
    getComposeUrl: () => 'https://social.example/compose',
    prefillsViaUrl: false,
    imageConstraints: {
      maxBytesPerImage: 10 * 1024 * 1024,
      maxImages: 4,
    },
    kinds: ['text', 'image'],
  };
}

function createPoster() {
  return createPlatformPoster({
    openedTabs: {
      record: vi.fn(),
      forget: vi.fn(),
    },
  });
}

describe('platform poster transport boundaries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveAdapter.mockResolvedValue(adapter());
    vi.stubGlobal('browser', {
      tabs: {
        create: vi.fn(async () => ({ id: 99 })),
        get: vi.fn(async () => ({ id: 42, url: 'https://social.example/compose' })),
      },
    });
  });

  it('does not open a DOM compose path after a selected API transport fails', async () => {
    mocks.tryApiPath.mockResolvedValue({
      success: false,
      error: 'statuses 403: forbidden',
    });

    const result = await createPoster().postToPlatform('mastodon', 'hello', undefined, undefined, undefined, true);

    expect(result).toMatchObject({
      success: false,
      error: 'statuses 403: forbidden',
      flow: {
        attempt: 'api',
        failedStep: 'api-post',
      },
    });
    expect(mocks.tryApiPath).toHaveBeenCalledOnce();
    expect(mocks.openOrFocusTab).not.toHaveBeenCalled();
    expect(mocks.sendPostMessageWhenReady).not.toHaveBeenCalled();
  });

  it('stops after one real-post dispatch when the content response times out', async () => {
    mocks.tryApiPath.mockResolvedValue('no-credentials');
    mocks.sendPostMessageWhenReady.mockRejectedValue(
      new Error('mastodon content script response timed out after 240000ms'),
    );

    const result = await createPoster().postToPlatform('mastodon', 'hello', undefined, undefined, undefined, true);

    expect(result).toMatchObject({
      success: false,
      uncertain: true,
      userAction: 'check-post-before-retry',
      flow: {
        submitReached: true,
        failedStep: 'capture-url',
      },
    });
    expect(mocks.openOrFocusTab).toHaveBeenCalledOnce();
    expect(mocks.sendPostMessageWhenReady).toHaveBeenCalledOnce();
    expect(mocks.capturePostUrlFromTabWithRetry).toHaveBeenCalledOnce();
  });

  it('stops after one real-post attempt when content reports submitReached', async () => {
    mocks.tryApiPath.mockResolvedValue('no-credentials');
    mocks.sendPostMessageWhenReady.mockResolvedValue({
      type: 'POST_RESULT',
      platform: 'mastodon',
      success: false,
      flow: {
        mode: 'post',
        submitReached: true,
        failedStep: 'post-submit-check',
      },
      error: 'post completion could not be confirmed',
    } satisfies PostResultMessage);

    const result = await createPoster().postToPlatform('mastodon', 'hello', undefined, undefined, undefined, true);

    expect(result).toMatchObject({
      success: false,
      uncertain: true,
      userAction: 'check-post-before-retry',
      flow: {
        submitReached: true,
        failedStep: 'post-submit-check',
      },
    });
    expect(mocks.openOrFocusTab).toHaveBeenCalledOnce();
    expect(mocks.sendPostMessageWhenReady).toHaveBeenCalledOnce();
  });
});
