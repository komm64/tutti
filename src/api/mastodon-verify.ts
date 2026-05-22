/**
 * Mastodon post verify via public REST API (v0.4.75〜).
 *
 * postUrl の host から instance を取り、 `/api/v1/statuses/:id` で status を fetch。
 * content は HTML なので tag strip して text 比較。
 */

import { buildVerifyResult, verifyError, type VerifyExpectation, type VerifyResult } from '../utils/post-verify';

export async function verifyMastodonPost(
  postUrl: string,
  expected: VerifyExpectation,
): Promise<VerifyResult> {
  try {
    // postUrl 例: https://mastodon.social/@user/123456789012345678
    const m = postUrl.match(/^(https:\/\/[^/]+)\/@[^/]+\/(\d+)/);
    if (!m) return verifyError(`Mastodon: post URL parse 失敗 (${postUrl})`);
    const instance = m[1]!;
    const id = m[2]!;
    const res = await fetch(`${instance}/api/v1/statuses/${id}`);
    if (!res.ok) return verifyError(`Mastodon: GET status ${res.status}`);
    const data = (await res.json()) as {
      content?: string;
      media_attachments?: unknown[];
    };
    // content は HTML、 strip tag して plain text に
    const html = data.content ?? '';
    const text = html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .trim();
    const hasImages = Array.isArray(data.media_attachments) && data.media_attachments.length > 0;
    return buildVerifyResult(expected, { text, hasImages });
  } catch (e) {
    return verifyError(`Mastodon verify 例外: ${e instanceof Error ? e.message : String(e)}`);
  }
}
