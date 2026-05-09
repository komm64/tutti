/**
 * Bluesky (ATProto) API client.
 *
 * docs: https://atproto.com/specs/xrpc / https://docs.bsky.app/docs/api/
 *
 * ## flow
 * 1. createSession (identifier + appPassword) → accessJwt
 * 2. (per image) uploadBlob → blob ref
 * 3. createRecord (app.bsky.feed.post) with text + embed (images)
 *
 * ## 制約
 * - 文字数: 300 (graphemes 計算が正確だが Tutti は popup 側で text-length 警告するので
 *   client では cap せず素通り)
 * - 画像: 4 枚まで、各 1MB 推奨 (実際は ~975KB が server-side cap)
 * - 動画は v1 では未対応 (uploadBlob は通るが video record schema 別、Phase 2 で)
 *
 * ## App Password
 * Settings → Privacy and Security → App Passwords で生成。
 * 形式: `xxxx-xxxx-xxxx-xxxx` (本パスワードの代替、特定 scope を持つ)
 * 拡張から認証する場合これを使う (本パスは Tutti に渡さない)。
 */

import type { BlueskyCredentials } from '../utils/api-credentials';
import { resolveAttachmentToBytes } from '../utils/attachment';
import type { ApiPostInput, ApiPostResult, ApiTestResult } from './types';

const DEFAULT_PDS = 'https://bsky.social';
const MAX_IMAGES = 4;

interface Session {
  accessJwt: string;
  did: string;
  handle: string;
}

async function createSession(creds: BlueskyCredentials): Promise<Session> {
  const pds = creds.pdsHost || DEFAULT_PDS;
  const res = await fetch(`${pds}/xrpc/com.atproto.server.createSession`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      identifier: creds.identifier,
      password: creds.appPassword,
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`createSession ${res.status}: ${detail.slice(0, 200)}`);
  }
  const data = (await res.json()) as { accessJwt?: string; did?: string; handle?: string };
  if (!data.accessJwt || !data.did || !data.handle) {
    throw new Error('createSession: invalid response (missing accessJwt/did/handle)');
  }
  return { accessJwt: data.accessJwt, did: data.did, handle: data.handle };
}

async function uploadBlob(
  session: Session,
  pds: string,
  bytes: Uint8Array,
  mimeType: string,
): Promise<{ $type: 'blob'; ref: { $link: string }; mimeType: string; size: number }> {
  const res = await fetch(`${pds}/xrpc/com.atproto.repo.uploadBlob`, {
    method: 'POST',
    headers: {
      'Content-Type': mimeType,
      Authorization: `Bearer ${session.accessJwt}`,
    },
    // Uint8Array は ArrayBufferView、fetch body にそのまま渡せる
    body: bytes as BodyInit,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`uploadBlob ${res.status}: ${detail.slice(0, 200)}`);
  }
  const data = (await res.json()) as { blob?: { $type: 'blob'; ref: { $link: string }; mimeType: string; size: number } };
  if (!data.blob) throw new Error('uploadBlob: no blob in response');
  return data.blob;
}

export async function postViaApi(
  creds: BlueskyCredentials,
  input: ApiPostInput,
): Promise<ApiPostResult> {
  try {
    const pds = creds.pdsHost || DEFAULT_PDS;
    const session = await createSession(creds);

    const imageRecords: { alt: string; image: { $type: 'blob'; ref: { $link: string }; mimeType: string; size: number } }[] = [];
    const images = (input.images ?? []).filter((m) => m.type.startsWith('image/')).slice(0, MAX_IMAGES);
    for (const img of images) {
      const bytes = await resolveAttachmentToBytes(img);
      const blob = await uploadBlob(session, pds, bytes, img.type);
      imageRecords.push({ alt: '', image: blob });
    }

    const record: Record<string, unknown> = {
      $type: 'app.bsky.feed.post',
      text: input.text,
      createdAt: new Date().toISOString(),
      langs: ['ja', 'en'],
    };
    if (imageRecords.length > 0) {
      record['embed'] = {
        $type: 'app.bsky.embed.images',
        images: imageRecords,
      };
    }

    const createRes = await fetch(`${pds}/xrpc/com.atproto.repo.createRecord`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.accessJwt}`,
      },
      body: JSON.stringify({
        repo: session.did,
        collection: 'app.bsky.feed.post',
        record,
      }),
    });
    if (!createRes.ok) {
      const detail = await createRes.text().catch(() => '');
      throw new Error(`createRecord ${createRes.status}: ${detail.slice(0, 200)}`);
    }
    const createData = (await createRes.json()) as { uri?: string };
    // uri 例: at://did:plc:xxx/app.bsky.feed.post/3kxyz
    // 公開 URL: https://bsky.app/profile/<handle>/post/<rkey>
    const rkey = createData.uri?.split('/').pop();
    const postUrl = rkey ? `https://bsky.app/profile/${session.handle}/post/${rkey}` : undefined;
    return { success: true, postUrl };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function testCredentials(creds: BlueskyCredentials): Promise<ApiTestResult> {
  try {
    const session = await createSession(creds);
    return { ok: true, identifier: session.handle };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
