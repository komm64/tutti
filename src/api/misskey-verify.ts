/**
 * Misskey post verify via public REST API (v0.4.75〜).
 *
 * postUrl の host から instance を取り、 `/api/notes/show` で note を fetch。
 * Misskey は本文を plain text で返す。
 */

import { buildVerifyResult, verifyError, type VerifyExpectation, type VerifyResult } from '../utils/post-verify';

export async function verifyMisskeyPost(
  postUrl: string,
  expected: VerifyExpectation,
): Promise<VerifyResult> {
  try {
    // postUrl 例: https://misskey.io/notes/a1b2c3d4
    const m = postUrl.match(/^(https:\/\/[^/]+)\/notes\/([^/?#]+)/);
    if (!m) return verifyError(`Misskey: post URL parse 失敗 (${postUrl})`);
    const instance = m[1]!;
    const noteId = m[2]!;
    const res = await fetch(`${instance}/api/notes/show`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ noteId }),
    });
    if (!res.ok) return verifyError(`Misskey: notes/show ${res.status}`);
    const data = (await res.json()) as {
      text?: string;
      cw?: string;
      files?: unknown[];
    };
    // Misskey の `text` はそのまま本文 (cw = content warning は別 field)
    const text = (data.cw ? `${data.cw}\n` : '') + (data.text ?? '');
    const hasImages = Array.isArray(data.files) && data.files.length > 0;
    return buildVerifyResult(expected, { text, hasImages });
  } catch (e) {
    return verifyError(`Misskey verify 例外: ${e instanceof Error ? e.message : String(e)}`);
  }
}
