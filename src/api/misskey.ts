/**
 * Misskey API client.
 *
 * docs: https://misskey-hub.net/en/docs/for-developers/api/endpoints/
 *
 * ## flow
 * 1. (per image) POST /api/drive/files/create (multipart) → fileId
 * 2. POST /api/notes/create with text + fileIds + visibility
 *
 * ## token 取得 (ユーザ向け)
 * - インスタンス Settings → API → "アクセストークンを発行"
 * - permissions: `write:notes`, `write:drive` (最小)
 * - 表示されたトークンを Tutti に paste
 *
 * ## 制約
 * - 文字数: instance 設定 (default 3000、misskey.io)
 * - 画像: 16 枚程度 (instance 依存)、Tutti は 4 枚に絞る (他 SNS と整合)
 */

import type { MisskeyCredentials } from '../utils/api-credentials';
import { resolveAttachmentToBytes } from '../utils/attachment';
import type { ApiPostInput, ApiPostResult, ApiTestResult } from './types';

async function uploadFile(
  creds: MisskeyCredentials,
  bytes: Uint8Array,
  mimeType: string,
  filename: string,
): Promise<string> {
  const fd = new FormData();
  // Misskey は token を form field でも accept する (header より楽)
  fd.append('i', creds.accessToken);
  fd.append('file', new Blob([bytes as BlobPart], { type: mimeType }), filename);
  const res = await fetch(`${creds.instance}/api/drive/files/create`, {
    method: 'POST',
    body: fd,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`drive/files/create ${res.status}: ${detail.slice(0, 200)}`);
  }
  const data = (await res.json()) as { id?: string };
  if (!data.id) throw new Error('drive/files/create: no id in response');
  return data.id;
}

export async function postViaApi(
  creds: MisskeyCredentials,
  input: ApiPostInput,
): Promise<ApiPostResult> {
  try {
    const fileIds: string[] = [];
    for (const m of input.images ?? []) {
      const bytes = await resolveAttachmentToBytes(m);
      const id = await uploadFile(creds, bytes, m.type, m.name || `tutti-${Date.now()}`);
      fileIds.push(id);
    }

    const body: Record<string, unknown> = {
      i: creds.accessToken,
      text: input.text,
      visibility: 'public',
    };
    if (fileIds.length > 0) body['fileIds'] = fileIds;

    const res = await fetch(`${creds.instance}/api/notes/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`notes/create ${res.status}: ${detail.slice(0, 200)}`);
    }
    const data = (await res.json()) as { createdNote?: { id?: string; user?: { username?: string } } };
    const noteId = data.createdNote?.id;
    const username = data.createdNote?.user?.username;
    const postUrl = noteId ? `${creds.instance}/notes/${noteId}` : undefined;
    void username;
    return { success: true, postUrl };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function testCredentials(creds: MisskeyCredentials): Promise<ApiTestResult> {
  try {
    // i/me で自分の info を取得 → 認証確認
    const res = await fetch(`${creds.instance}/api/i`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ i: creds.accessToken }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      return { ok: false, error: `api/i ${res.status}: ${detail.slice(0, 200)}` };
    }
    const data = (await res.json()) as { username?: string; host?: string | null };
    const ident = data.host ? `@${data.username}@${data.host}` : data.username;
    return { ok: true, identifier: ident };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
