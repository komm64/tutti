import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  POST_MESSAGE_RESPONSE_TIMEOUT_MS,
  VIDEO_POST_MESSAGE_RESPONSE_TIMEOUT_MS,
  buildLoginRedirectErrorForUrl,
  buildMissingReceiverLoginError,
  isMissingReceiverError,
  resolvePostMessageResponseTimeoutMs,
  sendPostMessageWhenReady,
} from './content-dispatch';

vi.mock('../utils/web-action-pacing', () => ({
  waitForWebActionPacing: vi.fn(async () => 0),
}));

const originalBrowser = (globalThis as { browser?: unknown }).browser;

function stubBrowserTab(tab: { url?: string; pendingUrl?: string } | string): void {
  const tabInfo = typeof tab === 'string' ? { url: tab } : tab;
  vi.stubGlobal('browser', {
    i18n: {
      getMessage: (key: string) => (key === 'failureReasonLogin' ? 'SIGN IN REQUIRED' : key),
    },
    tabs: {
      get: vi.fn(async () => tabInfo),
    },
  });
}

describe('buildMissingReceiverLoginError', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    (globalThis as { browser?: unknown }).browser = originalBrowser;
  });

  it('turns Google account chooser redirects into a login error', async () => {
    stubBrowserTab('https://accounts.google.com/v3/signin/accountchooser?service=youtube');

    await expect(buildMissingReceiverLoginError(123)).resolves.toBe('SIGN IN REQUIRED (accounts.google.com)');
  });

  it('detects login redirects from plain URLs', () => {
    stubBrowserTab('https://example.com/');

    expect(buildLoginRedirectErrorForUrl('https://example.social/login')).toBe('SIGN IN REQUIRED (example.social)');
  });

  it('also checks pendingUrl while a login redirect is still loading', async () => {
    stubBrowserTab({ pendingUrl: 'https://accounts.google.com/v3/signin/accountchooser?service=youtube' });

    await expect(buildMissingReceiverLoginError(123)).resolves.toBe('SIGN IN REQUIRED (accounts.google.com)');
  });

  it('reports YouTube sign-in when a Google redirect is hidden by host permissions', async () => {
    stubBrowserTab({});

    await expect(buildMissingReceiverLoginError(123, 'youtube')).resolves.toBe('SIGN IN REQUIRED (YouTube / Google)');
  });

  it('does not rewrite normal SNS pages', async () => {
    stubBrowserTab('https://studio.youtube.com/');

    await expect(buildMissingReceiverLoginError(123)).resolves.toBeNull();
  });

  it('recognizes Chrome receiver-missing errors', () => {
    expect(isMissingReceiverError(new Error('Could not establish connection. Receiving end does not exist.'))).toBe(true);
    expect(isMissingReceiverError(new Error('The message port closed before a response was received.'))).toBe(false);
  });

  it('times out when a content script listener never responds', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('browser', {
      i18n: {
        getMessage: (key: string) => key,
      },
      tabs: {
        get: vi.fn(async () => ({ url: 'https://studio.youtube.com/' })),
        sendMessage: vi.fn(() => new Promise(() => { /* never resolves */ })),
      },
    });

    const promise = sendPostMessageWhenReady(123, {
      type: 'POST_TO_PLATFORM',
      platform: 'youtube',
      text: 'hello',
      dryRun: true,
    });
    const assertion = expect(promise).rejects.toThrow('youtube content script response timed out');

    await vi.advanceTimersByTimeAsync(POST_MESSAGE_RESPONSE_TIMEOUT_MS);

    await assertion;
  });

  it('scales text/image and video budgets for multi-post threads', () => {
    expect(resolvePostMessageResponseTimeoutMs({
      type: 'POST_TO_PLATFORM',
      platform: 'threads',
      text: 'four images',
      images: Array.from({ length: 4 }, (_, index) => ({
        name: `${index}.png`,
        type: 'image/png',
        data: 'AA==',
      })),
    })).toBe(POST_MESSAGE_RESPONSE_TIMEOUT_MS);

    expect(resolvePostMessageResponseTimeoutMs({
      type: 'POST_TO_PLATFORM',
      platform: 'tumblr',
      text: 'four images',
      images: [{ name: '0.png', type: 'image/png', data: 'AA==' }],
    })).toBe(POST_MESSAGE_RESPONSE_TIMEOUT_MS);

    expect(resolvePostMessageResponseTimeoutMs({
      type: 'POST_TO_PLATFORM',
      platform: 'mastodon',
      text: 'text only',
    })).toBe(POST_MESSAGE_RESPONSE_TIMEOUT_MS);

    expect(resolvePostMessageResponseTimeoutMs({
      type: 'POST_TO_PLATFORM',
      platform: 'bluesky',
      text: 'first',
      textChunks: ['first', 'second', 'third'],
    })).toBe(POST_MESSAGE_RESPONSE_TIMEOUT_MS * 3);

    expect(resolvePostMessageResponseTimeoutMs({
      type: 'POST_TO_PLATFORM',
      platform: 'instagram',
      text: 'video',
      images: [{ name: 'clip.mp4', type: 'video/mp4', data: 'AA==' }],
    })).toBe(VIDEO_POST_MESSAGE_RESPONSE_TIMEOUT_MS);

    expect(resolvePostMessageResponseTimeoutMs({
      type: 'POST_TO_PLATFORM',
      platform: 'bluesky',
      text: 'first',
      textChunks: ['first', 'second', 'third'],
      images: [{ name: 'clip.mp4', type: 'video/mp4', data: 'AA==' }],
    })).toBe(
      VIDEO_POST_MESSAGE_RESPONSE_TIMEOUT_MS +
      POST_MESSAGE_RESPONSE_TIMEOUT_MS * 2,
    );
  });
});
