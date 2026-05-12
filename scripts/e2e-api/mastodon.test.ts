/**
 * Mastodon API path E2E smoke test。
 *
 * 必要な env:
 *   E2E_MASTODON_INSTANCE  例: https://mastodon.social (末尾スラッシュなし)
 *   E2E_MASTODON_TOKEN     /settings/applications で発行した access token
 *                          scope: write:statuses, write:media
 */

import { describe, it, expect } from 'vitest';
import { postViaApi } from '../../src/api/mastodon';
import { envSkipIf, testText } from './_lib';

const SKIP = envSkipIf('E2E_MASTODON_INSTANCE', 'E2E_MASTODON_TOKEN');

async function deleteMastodonStatus(
  instance: string,
  token: string,
  postUrl: string,
): Promise<void> {
  // postUrl 例: https://mastodon.social/@tutti_test/123456789
  const m = postUrl.match(/\/(\d+)$/);
  if (!m) throw new Error(`cleanup: status id 抽出失敗 from ${postUrl}`);
  const statusId = m[1];

  const res = await fetch(`${instance}/api/v1/statuses/${statusId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`DELETE statuses ${res.status}: ${detail.slice(0, 200)}`);
  }
}

describe.skipIf(SKIP)('Mastodon API E2E', () => {
  it('posts text and cleans up', async () => {
    const instance = process.env.E2E_MASTODON_INSTANCE!;
    const token = process.env.E2E_MASTODON_TOKEN!;
    const text = testText('mastodon');

    let postUrl: string | undefined;
    try {
      const result = await postViaApi(
        { instance, accessToken: token },
        { text, images: [] },
      );
      expect(result.success, `post failed: ${result.error}`).toBe(true);
      expect(result.postUrl).toMatch(/^https?:\/\//);
      postUrl = result.postUrl;
    } finally {
      if (postUrl) {
        await deleteMastodonStatus(instance, token, postUrl).catch((e) => {
          console.warn(`[mastodon e2e] cleanup 失敗 (要手動): ${e}`);
        });
      }
    }
  }, 30_000);
});
