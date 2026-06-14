import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildLoginRedirectErrorForUrl,
  buildMissingReceiverLoginError,
  isMissingReceiverError,
} from './content-dispatch';

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
});
