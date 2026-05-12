/**
 * Misskey API path E2E smoke test。
 *
 * 必要な env:
 *   E2E_MISSKEY_INSTANCE  例: https://misskey.io (末尾スラッシュなし)
 *   E2E_MISSKEY_TOKEN     Settings → API → アクセストークン発行 で取得
 *                         scope: write:notes, write:drive
 */

import { describe, it, expect } from 'vitest';
import { postViaApi } from '../../src/api/misskey';
import { envSkipIf, testText } from './_lib';

const SKIP = envSkipIf('E2E_MISSKEY_INSTANCE', 'E2E_MISSKEY_TOKEN');

async function deleteMisskeyNote(
  instance: string,
  token: string,
  postUrl: string,
): Promise<void> {
  // postUrl 例: https://misskey.io/notes/abc123
  const m = postUrl.match(/\/notes\/([^/?#]+)/);
  if (!m) throw new Error(`cleanup: noteId 抽出失敗 from ${postUrl}`);
  const noteId = m[1];

  const res = await fetch(`${instance}/api/notes/delete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ i: token, noteId }),
  });
  // Misskey は成功時 204 を返す
  if (!res.ok && res.status !== 204) {
    const detail = await res.text().catch(() => '');
    throw new Error(`notes/delete ${res.status}: ${detail.slice(0, 200)}`);
  }
}

describe.skipIf(SKIP)('Misskey API E2E', () => {
  it('posts text and cleans up', async () => {
    const instance = process.env.E2E_MISSKEY_INSTANCE!;
    const token = process.env.E2E_MISSKEY_TOKEN!;
    const text = testText('misskey');

    let postUrl: string | undefined;
    try {
      const result = await postViaApi(
        { instance, accessToken: token },
        { text, images: [] },
      );
      expect(result.success, `post failed: ${result.error}`).toBe(true);
      expect(result.postUrl).toMatch(/\/notes\//);
      postUrl = result.postUrl;
    } finally {
      if (postUrl) {
        await deleteMisskeyNote(instance, token, postUrl).catch((e) => {
          console.warn(`[misskey e2e] cleanup 失敗 (要手動): ${e}`);
        });
      }
    }
  }, 30_000);
});
