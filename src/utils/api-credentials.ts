/**
 * SNS API 連携用 credentials 管理。
 *
 * ## 設計方針
 * - **chrome.storage.local 限定** (sync 経由で Google アカウント propagate を避ける)
 * - **拡張ローカルにのみ保存、Tutti サーバには絶対送らない** (no-backend 原則維持)
 * - **無設定 → 従来 DOM path** (default は API 化しない、上級者向け opt-in)
 *
 * ## 対応 SNS (Phase 1)
 * - Bluesky: identifier (handle) + App Password (固定文字列、OAuth 不要)
 * - Mastodon: instance URL + access token (instance ごとに /settings/applications で生成)
 * - Misskey: instance URL + API token (settings → API → トークン)
 *
 * X / Threads / IG 等は OAuth 必要 + dev account 審査が重いので Phase 2 以降。
 */

export interface BlueskyCredentials {
  /** ATProto identifier: handle (e.g. "user.bsky.social") or email */
  identifier: string;
  /** App Password (本パスワードでなく settings → app passwords で生成したもの) */
  appPassword: string;
  /**
   * PDS host (ATProto は users が異なる pds に分散できるが、ほとんどの人は
   * bsky.social)。空 / undefined なら "https://bsky.social"。
   */
  pdsHost?: string;
}

export interface MastodonCredentials {
  /** インスタンス URL (https://mastodon.social 等、末尾 slash 無し) */
  instance: string;
  /** /settings/applications で生成した access token (write scope 必須) */
  accessToken: string;
}

export interface MisskeyCredentials {
  /** インスタンス URL (https://misskey.io 等) */
  instance: string;
  /** Settings → API → 「アクセストークン発行」で作る (write:notes 等) */
  accessToken: string;
}

export interface ApiCredentials {
  bluesky?: BlueskyCredentials;
  mastodon?: MastodonCredentials;
  misskey?: MisskeyCredentials;
}

const STORAGE_KEY = 'apiCredentials';

export async function getApiCredentials(): Promise<ApiCredentials> {
  const stored = await browser.storage.local.get(STORAGE_KEY);
  return (stored[STORAGE_KEY] as ApiCredentials | undefined) ?? {};
}

export async function setApiCredentials(creds: Partial<ApiCredentials>): Promise<void> {
  const current = await getApiCredentials();
  // null 渡しで個別 platform を消去できるようにする
  const merged = { ...current, ...creds };
  for (const k of Object.keys(creds) as (keyof ApiCredentials)[]) {
    if (creds[k] === null || creds[k] === undefined) delete merged[k];
  }
  await browser.storage.local.set({ [STORAGE_KEY]: merged });
}

export async function clearApiCredentials(platform: keyof ApiCredentials): Promise<void> {
  const current = await getApiCredentials();
  delete current[platform];
  await browser.storage.local.set({ [STORAGE_KEY]: current });
}
