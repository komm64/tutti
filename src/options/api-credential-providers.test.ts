import { describe, expect, it, vi } from 'vitest';
import {
  API_CREDENTIAL_PROVIDERS,
  clearProviderApiCredential,
  createApiCredentialEditorStates,
  testAndSaveApiCredential,
} from './api-credential-providers';

describe('Options API credential providers', () => {
  it('defines one complete descriptor per stored provider', () => {
    expect(API_CREDENTIAL_PROVIDERS.map((provider) => provider.id)).toEqual([
      'bluesky',
      'mastodon',
      'misskey',
    ]);
    expect(new Set(API_CREDENTIAL_PROVIDERS.map((provider) => provider.id)).size)
      .toBe(API_CREDENTIAL_PROVIDERS.length);
  });

  it('loads stored credential shapes into shared editor state', () => {
    const states = createApiCredentialEditorStates({
      bluesky: { identifier: 'alice.bsky.social', appPassword: 'app-pass' },
      mastodon: { instance: 'https://social.example', accessToken: 'mastodon-token' },
    });

    expect(states.bluesky).toMatchObject({
      primary: 'alice.bsky.social',
      secret: 'app-pass',
      busy: false,
      status: null,
    });
    expect(states.mastodon).toMatchObject({
      primary: 'https://social.example',
      secret: 'mastodon-token',
    });
    expect(states.misskey).toMatchObject({
      primary: 'https://misskey.io',
      secret: '',
    });
  });

  it('normalizes a custom instance, requests permission, tests, and saves', async () => {
    const provider = API_CREDENTIAL_PROVIDERS.find(({ id }) => id === 'mastodon')!;
    const requestPermission = vi.fn(async () => true);
    const testCredentials = vi.fn(async () => ({ ok: true, identifier: 'alice@example.social' }));
    const setCredentials = vi.fn(async () => {});

    await expect(testAndSaveApiCredential(
      provider,
      { primary: ' https://example.social/ ', secret: ' token ' },
      { requestPermission, testCredentials, setCredentials },
    )).resolves.toEqual({ ok: true, identifier: 'alice@example.social' });

    expect(requestPermission).toHaveBeenCalledWith('https://example.social');
    expect(testCredentials).toHaveBeenCalledWith(provider, {
      mastodon: {
        instance: 'https://example.social',
        accessToken: 'token',
      },
    });
    expect(setCredentials).toHaveBeenCalledWith({
      mastodon: {
        instance: 'https://example.social',
        accessToken: 'token',
      },
    });
  });

  it('does not test or save missing fields or denied custom origins', async () => {
    const provider = API_CREDENTIAL_PROVIDERS.find(({ id }) => id === 'misskey')!;
    const testCredentials = vi.fn(async () => ({ ok: true }));
    const setCredentials = vi.fn(async () => {});

    await expect(testAndSaveApiCredential(
      provider,
      { primary: 'https://misskey.io', secret: '' },
      { testCredentials, setCredentials },
    )).resolves.toEqual({ ok: false, reason: 'missing' });
    await expect(testAndSaveApiCredential(
      provider,
      { primary: 'https://custom.example', secret: 'token' },
      {
        requestPermission: vi.fn(async () => false),
        testCredentials,
        setCredentials,
      },
    )).resolves.toEqual({ ok: false, reason: 'permission-denied' });

    expect(testCredentials).not.toHaveBeenCalled();
    expect(setCredentials).not.toHaveBeenCalled();
  });

  it('clears through the provider id', async () => {
    const provider = API_CREDENTIAL_PROVIDERS[0]!;
    const clearCredentials = vi.fn(async () => {});

    await clearProviderApiCredential(provider, clearCredentials);

    expect(clearCredentials).toHaveBeenCalledWith('bluesky');
  });
});
