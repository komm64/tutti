/**
 * Bluesky API path E2E smoke test。
 *
 * 実 test 垢で post → 公開 URL を確認 → deleteRecord で必ず cleanup。
 *
 * 必要な env (CI は repo secrets で渡す):
 *   E2E_BLUESKY_IDENTIFIER  例: tutti-test.bsky.social
 *   E2E_BLUESKY_PASSWORD    Settings → App Passwords で生成した password
 *
 * 未設定なら describe.skipIf で test 自体をスキップ (CI 失敗扱いにしない)。
 */

import { describe, it, expect } from 'vitest';
import { postViaApi } from '../../src/api/bluesky';
import { envSkipIf, testText } from './_lib';

const SKIP = envSkipIf('E2E_BLUESKY_IDENTIFIER', 'E2E_BLUESKY_PASSWORD');
const DEFAULT_PDS = 'https://bsky.social';

async function deleteBlueskyPost(
  identifier: string,
  password: string,
  postUrl: string,
): Promise<void> {
  // 1. re-auth (test 内で session を引き回しても良いが、_lib に押し出すと
  //    cleanup 専用 helper にしたいので独立 fn にしておく)
  const sessRes = await fetch(`${DEFAULT_PDS}/xrpc/com.atproto.server.createSession`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier, password }),
  });
  if (!sessRes.ok) throw new Error(`cleanup auth ${sessRes.status}`);
  const sess = (await sessRes.json()) as { accessJwt: string; did: string };

  // 2. postUrl から rkey を抜く: https://bsky.app/profile/<handle>/post/<rkey>
  const m = postUrl.match(/\/post\/([^/?#]+)/);
  if (!m) throw new Error(`cleanup: rkey 抽出失敗 from ${postUrl}`);
  const rkey = m[1];

  // 3. deleteRecord
  const delRes = await fetch(`${DEFAULT_PDS}/xrpc/com.atproto.repo.deleteRecord`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${sess.accessJwt}`,
    },
    body: JSON.stringify({
      repo: sess.did,
      collection: 'app.bsky.feed.post',
      rkey,
    }),
  });
  if (!delRes.ok) {
    const detail = await delRes.text().catch(() => '');
    throw new Error(`deleteRecord ${delRes.status}: ${detail.slice(0, 200)}`);
  }
}

describe.skipIf(SKIP)('Bluesky API E2E', () => {
  it('posts text and cleans up', async () => {
    const identifier = process.env.E2E_BLUESKY_IDENTIFIER!;
    const password = process.env.E2E_BLUESKY_PASSWORD!;
    const text = testText('bluesky');

    let postUrl: string | undefined;
    try {
      const result = await postViaApi(
        { identifier, appPassword: password },
        { text, images: [] },
      );
      expect(result.success, `post failed: ${result.error}`).toBe(true);
      expect(result.postUrl).toMatch(/^https:\/\/bsky\.app\/profile\/.+\/post\//);
      postUrl = result.postUrl;
    } finally {
      if (postUrl) {
        await deleteBlueskyPost(identifier, password, postUrl).catch((e) => {
          console.warn(`[bluesky e2e] cleanup 失敗 (test 垢の timeline 要手動掃除): ${e}`);
        });
      }
    }
  }, 30_000);
});
