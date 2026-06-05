/**
 * Mastodon API client (Mastodon API v2 のシンプル subset)。
 *
 * docs: https://docs.joinmastodon.org/methods/statuses/ /media/
 *
 * ## flow
 * 1. (per image/video) POST /api/v2/media (multipart) → media id
 * 2. POST /api/v1/statuses with status + media_ids[] + visibility
 *
 * ## token 取得 (ユーザ向け)
 * - インスタンスの `/settings/applications` → New Application
 * - Scopes: `write:statuses`, `write:media` (最小)
 * - 生成された "Your access token" を Tutti に paste
 *
 * ## 制約
 * - 文字数: instance 設定 (default 500、glitch-soc 等で 65535 まで)。Tutti popup 側で警告
 * - 画像: 4 枚 (default)、video 1 件まで
 * - max upload size: 10MB image / 40MB video (Tutti の adapter constraint で reject 済)
 */

import type { MastodonCredentials } from '../utils/api-credentials';
import { resolveAttachmentToBytes } from '../utils/attachment';
import type { ApiPostInput, ApiPostResult, ApiTestResult } from './types';

async function uploadMedia(
  creds: MastodonCredentials,
  bytes: Uint8Array,
  mimeType: string,
  filename: string,
  description?: string,
): Promise<string> {
  const fd = new FormData();
  fd.append('file', new Blob([bytes as BlobPart], { type: mimeType }), filename);
  if (description) fd.append('description', description);
  const res = await fetch(`${creds.instance}/api/v2/media`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${creds.accessToken}` },
    body: fd,
  });
  // /api/v2/media は async 200 OR 202 (still processing)
  if (!res.ok && res.status !== 202) {
    const detail = await res.text().catch(() => '');
    throw new Error(`uploadMedia ${res.status}: ${detail.slice(0, 200)}`);
  }
  const data = (await res.json()) as { id?: string };
  if (!data.id) throw new Error('uploadMedia: no id in response');
  return data.id;
}

export async function postViaApi(
  creds: MastodonCredentials,
  input: ApiPostInput,
): Promise<ApiPostResult> {
  let statusRequestInFlight = false;
  try {
    const mediaIds: string[] = [];
    for (const m of input.images ?? []) {
      const bytes = await resolveAttachmentToBytes(m);
      const id = await uploadMedia(creds, bytes, m.type, m.name || `tutti-media-${Date.now()}`, m.alt);
      mediaIds.push(id);
    }

    // Idempotency-Key: 同じ key で重複 POST しても複製されない
    const idemKey = `tutti-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

    const body: Record<string, unknown> = { status: input.text };
    if (mediaIds.length > 0) body['media_ids'] = mediaIds;
    if (input.cw) body['spoiler_text'] = input.cw;
    if (input.visibility) body['visibility'] = input.visibility;

    statusRequestInFlight = true;
    const res = await fetch(`${creds.instance}/api/v1/statuses`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': idemKey,
        Authorization: `Bearer ${creds.accessToken}`,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      statusRequestInFlight = false;
      const detail = await res.text().catch(() => '');
      throw new Error(`statuses ${res.status}: ${detail.slice(0, 200)}`);
    }
    const data = (await res.json()) as { url?: string };
    return { success: true, postUrl: data.url };
  } catch (e) {
    return {
      success: false,
      uncertain: statusRequestInFlight || undefined,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export async function testCredentials(creds: MastodonCredentials): Promise<ApiTestResult> {
  try {
    const res = await fetch(`${creds.instance}/api/v1/accounts/verify_credentials`, {
      headers: { Authorization: `Bearer ${creds.accessToken}` },
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      return { ok: false, error: `verify_credentials ${res.status}: ${detail.slice(0, 200)}` };
    }
    const data = (await res.json()) as { username?: string; acct?: string };
    return { ok: true, identifier: data.acct || data.username };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
