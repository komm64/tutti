import { testCredentials as testBluesky } from '../api/bluesky';
import { testCredentials as testMastodon } from '../api/mastodon';
import { testCredentials as testMisskey } from '../api/misskey';
import type { ApiTestResult } from '../api/types';
import {
  clearApiCredentials,
  setApiCredentials,
  type ApiCredentials,
} from '../utils/api-credentials';

export type ApiCredentialProviderId = keyof ApiCredentials;

export interface ApiCredentialFields {
  primary: string;
  secret: string;
}

export interface ApiCredentialEditorState extends ApiCredentialFields {
  busy: boolean;
  status: { ok?: boolean; msg: string } | null;
}

interface PreparedCredential {
  credentials: Partial<ApiCredentials>;
  permission?: {
    origin: string;
    defaultOrigin: string;
  };
}

export interface ApiCredentialProviderDescriptor {
  id: ApiCredentialProviderId;
  name: string;
  primaryInputType: 'text' | 'url';
  primaryPlaceholder: string;
  secretPlaceholder: string;
  defaultPrimary: string;
  helpLabelKey: string;
  missingMessageKey: string;
  clearPrimaryOnClear: boolean;
  helpUrl: (primary: string) => string;
  readFields: (credentials: ApiCredentials) => ApiCredentialFields;
  prepare: (fields: ApiCredentialFields) => PreparedCredential | null;
  test: (credentials: Partial<ApiCredentials>) => Promise<ApiTestResult>;
  formatIdentifier: (identifier: string) => string;
}

const MASTODON_DEFAULT = 'https://mastodon.social';
const MISSKEY_DEFAULT = 'https://misskey.io';

export const API_CREDENTIAL_PROVIDERS: readonly ApiCredentialProviderDescriptor[] = [
  {
    id: 'bluesky',
    name: 'Bluesky',
    primaryInputType: 'text',
    primaryPlaceholder: 'user.bsky.social',
    secretPlaceholder: 'xxxx-xxxx-xxxx-xxxx (App Password)',
    defaultPrimary: '',
    helpLabelKey: 'apiBlueskyMakePassword',
    missingMessageKey: 'apiBskyMissing',
    clearPrimaryOnClear: true,
    helpUrl: () => 'https://bsky.app/settings/app-passwords',
    readFields: (credentials) => ({
      primary: credentials.bluesky?.identifier ?? '',
      secret: credentials.bluesky?.appPassword ?? '',
    }),
    prepare: (fields) => {
      const identifier = fields.primary.trim();
      const appPassword = fields.secret.trim();
      return identifier && appPassword
        ? { credentials: { bluesky: { identifier, appPassword } } }
        : null;
    },
    test: (credentials) => testBluesky(credentials.bluesky!),
    formatIdentifier: (identifier) => identifier,
  },
  {
    id: 'mastodon',
    name: 'Mastodon',
    primaryInputType: 'url',
    primaryPlaceholder: MASTODON_DEFAULT,
    secretPlaceholder: 'access token (write:statuses + write:media)',
    defaultPrimary: MASTODON_DEFAULT,
    helpLabelKey: 'apiMastodonMakeApp',
    missingMessageKey: 'apiInstanceTokenMissing',
    clearPrimaryOnClear: false,
    helpUrl: (primary) =>
      `${normalizeCredentialUrl(primary) ?? MASTODON_DEFAULT}/settings/applications`,
    readFields: (credentials) => ({
      primary: credentials.mastodon?.instance ?? MASTODON_DEFAULT,
      secret: credentials.mastodon?.accessToken ?? '',
    }),
    prepare: (fields) => {
      const instance = normalizeCredentialUrl(fields.primary);
      const accessToken = fields.secret.trim();
      return instance && accessToken
        ? {
            credentials: { mastodon: { instance, accessToken } },
            permission: { origin: instance, defaultOrigin: MASTODON_DEFAULT },
          }
        : null;
    },
    test: (credentials) => testMastodon(credentials.mastodon!),
    formatIdentifier: (identifier) => `@${identifier}`,
  },
  {
    id: 'misskey',
    name: 'Misskey',
    primaryInputType: 'url',
    primaryPlaceholder: MISSKEY_DEFAULT,
    secretPlaceholder: 'access token (write:notes + write:drive)',
    defaultPrimary: MISSKEY_DEFAULT,
    helpLabelKey: 'apiMisskeyMakeToken',
    missingMessageKey: 'apiInstanceTokenMissing',
    clearPrimaryOnClear: false,
    helpUrl: (primary) =>
      `${normalizeCredentialUrl(primary) ?? MISSKEY_DEFAULT}/settings/api`,
    readFields: (credentials) => ({
      primary: credentials.misskey?.instance ?? MISSKEY_DEFAULT,
      secret: credentials.misskey?.accessToken ?? '',
    }),
    prepare: (fields) => {
      const instance = normalizeCredentialUrl(fields.primary);
      const accessToken = fields.secret.trim();
      return instance && accessToken
        ? {
            credentials: { misskey: { instance, accessToken } },
            permission: { origin: instance, defaultOrigin: MISSKEY_DEFAULT },
          }
        : null;
    },
    test: (credentials) => testMisskey(credentials.misskey!),
    formatIdentifier: (identifier) => identifier,
  },
];

export function createApiCredentialEditorStates(
  credentials: ApiCredentials = {},
): Record<ApiCredentialProviderId, ApiCredentialEditorState> {
  return Object.fromEntries(API_CREDENTIAL_PROVIDERS.map((provider) => [
    provider.id,
    {
      ...provider.readFields(credentials),
      busy: false,
      status: null,
    },
  ])) as Record<ApiCredentialProviderId, ApiCredentialEditorState>;
}

export type ApiCredentialSaveResult =
  | { ok: true; identifier?: string }
  | {
      ok: false;
      reason: 'missing' | 'permission-denied' | 'test-failed';
      error?: string;
    };

export async function testAndSaveApiCredential(
  provider: ApiCredentialProviderDescriptor,
  fields: ApiCredentialFields,
  dependencies: {
    requestPermission?: (origin: string) => Promise<boolean>;
    testCredentials?: (
      provider: ApiCredentialProviderDescriptor,
      credentials: Partial<ApiCredentials>,
    ) => Promise<ApiTestResult>;
    setCredentials?: (credentials: Partial<ApiCredentials>) => Promise<void>;
  } = {},
): Promise<ApiCredentialSaveResult> {
  const prepared = provider.prepare(fields);
  if (!prepared) return { ok: false, reason: 'missing' };

  try {
    if (prepared.permission &&
        prepared.permission.origin !== prepared.permission.defaultOrigin) {
      const requestPermission = dependencies.requestPermission ??
        ((origin: string) => browser.permissions.request({
          origins: [`${origin}/*`],
        }));
      if (!await requestPermission(prepared.permission.origin)) {
        return { ok: false, reason: 'permission-denied' };
      }
    }

    const result = dependencies.testCredentials
      ? await dependencies.testCredentials(provider, prepared.credentials)
      : await provider.test(prepared.credentials);
    if (!result.ok) {
      return {
        ok: false,
        reason: 'test-failed',
        error: result.error,
      };
    }
    await (dependencies.setCredentials ?? setApiCredentials)(prepared.credentials);
    return { ok: true, identifier: result.identifier };
  } catch (error) {
    return {
      ok: false,
      reason: 'test-failed',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function clearProviderApiCredential(
  provider: ApiCredentialProviderDescriptor,
  clearCredentials: typeof clearApiCredentials = clearApiCredentials,
): Promise<void> {
  await clearCredentials(provider.id);
}

export function normalizeCredentialUrl(input: string): string | null {
  const url = input.trim().replace(/\/$/, '');
  return url.startsWith('https://') ? url : null;
}
