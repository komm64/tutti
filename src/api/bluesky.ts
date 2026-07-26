/**
 * Bluesky (ATProto) API client.
 *
 * docs: https://atproto.com/specs/xrpc / https://docs.bsky.app/docs/api/
 *
 * ## flow
 * 1. createSession (identifier + appPassword) → accessJwt
 * 2. image: uploadBlob → blob ref / video: video.bsky.app preprocessing → blob ref
 * 3. createRecord (app.bsky.feed.post) with text + embed (images/video)
 *
 * ## 制約
 * - 文字数: 300 (graphemes 計算が正確だが Tutti は popup 側で text-length 警告するので
 *   client では cap せず素通り)
 * - 画像: 4 枚まで、各 1MB 推奨 (実際は ~975KB が server-side cap)
 * - 動画: 1 本まで。画像との混在は ATProto embed schema 上サポートしない。
 *
 * ## App Password
 * Settings → Privacy and Security → App Passwords で生成。
 * 形式: `xxxx-xxxx-xxxx-xxxx` (本パスワードの代替、特定 scope を持つ)
 * 拡張から認証する場合これを使う (本パスは Tutti に渡さない)。
 */

import type { BlueskyCredentials } from '../utils/api-credentials';
import { resolveAttachmentToBytes } from '../utils/attachment';
import { log } from '../utils/logger';
import { buildBlueskyFacetsAsync } from './bluesky-facets';
import type { ApiPostInput, ApiPostResult, ApiTestResult } from './types';

const DEFAULT_PDS = 'https://bsky.social';
const VIDEO_SERVICE = 'https://video.bsky.app';
const MAX_IMAGES = 4;
const VIDEO_SERVICE_AUTH_EXPIRY_SECONDS = 30 * 60;
const VIDEO_PROCESS_TIMEOUT_MS = 180_000;
const VIDEO_PROCESS_POLL_MS = 1_000;

type BlobRef = { $type: 'blob'; ref: { $link: string }; mimeType: string; size: number };
type VideoJobStatus = {
  jobId?: string;
  state?: string;
  progress?: number;
  blob?: BlobRef;
  error?: string;
  message?: string;
};

export interface Session {
  accessJwt: string;
  did: string;
  handle: string;
  pdsHost?: string;
}

/**
 * Bluesky の reply target (thread 連結用)。 root = thread の先頭 post URI、
 * parent = 直接の返信元 post URI。 通常は 2 chunk thread だと root === parent。
 */
export interface BlueskyReplyTarget {
  rootUri: string;
  rootCid: string;
  parentUri: string;
  parentCid: string;
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
  return { accessJwt: data.accessJwt, did: data.did, handle: data.handle, pdsHost: pds };
}

async function uploadBlob(
  session: Session,
  pds: string,
  bytes: Uint8Array,
  mimeType: string,
): Promise<BlobRef> {
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
  const data = (await res.json()) as { blob?: BlobRef };
  if (!data.blob) throw new Error('uploadBlob: no blob in response');
  return data.blob;
}

async function getVideoServiceToken(session: Session, pds: string): Promise<string> {
  const pdsHost = new URL(pds).hostname;
  const audience = decodeJwtAudience(session.accessJwt) ?? `did:web:${pdsHost}`;
  const params = new URLSearchParams({
    aud: audience,
    lxm: 'com.atproto.repo.uploadBlob',
    exp: String(Math.floor(Date.now() / 1000) + VIDEO_SERVICE_AUTH_EXPIRY_SECONDS),
  });
  const res = await fetch(`${pds}/xrpc/com.atproto.server.getServiceAuth?${params}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${session.accessJwt}`,
    },
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`getServiceAuth ${res.status}: ${detail.slice(0, 200)}`);
  }
  const data = (await res.json()) as { token?: string };
  if (!data.token) throw new Error('getServiceAuth: missing token');
  return data.token;
}

function decodeJwtAudience(jwt: string): string | undefined {
  const payload = jwt.split('.')[1];
  if (!payload) return undefined;
  try {
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
    const parsed = JSON.parse(atob(padded)) as { aud?: unknown };
    return typeof parsed.aud === 'string' ? parsed.aud : undefined;
  } catch {
    return undefined;
  }
}

async function uploadVideoToService(
  session: Session,
  pds: string,
  bytes: Uint8Array,
  mimeType: string,
  name: string,
): Promise<BlobRef> {
  log.info(`Bluesky API video upload start: bytes=${bytes.length} mime=${mimeType}`);
  const token = await getVideoServiceToken(session, pds);
  const uploadUrl = new URL(`${VIDEO_SERVICE}/xrpc/app.bsky.video.uploadVideo`);
  uploadUrl.searchParams.set('did', session.did);
  uploadUrl.searchParams.set('name', name || `tutti-video-${Date.now()}.mp4`);

  const uploadRes = await fetch(uploadUrl.toString(), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': mimeType || 'video/mp4',
    },
    body: bytes as BodyInit,
  });
  const firstStatus = await parseVideoStatusResponse(uploadRes, 'uploadVideo');
  const firstBlob = extractVideoBlob(firstStatus);
  if (firstBlob) {
    log.info('Bluesky API video upload returned ready blob');
    return firstBlob;
  }

  const jobId = extractVideoJobId(firstStatus);
  if (!jobId) {
    throw new Error('uploadVideo: missing jobId and blob in response');
  }

  const deadline = Date.now() + VIDEO_PROCESS_TIMEOUT_MS;
  let lastState = extractVideoState(firstStatus);
  while (Date.now() < deadline) {
    await sleep(VIDEO_PROCESS_POLL_MS);
    const status = await getVideoJobStatus(jobId);
    const blob = extractVideoBlob(status);
    const state = extractVideoState(status);
    if (state !== lastState) {
      log.info(`Bluesky API video processing: job=${jobId} state=${state ?? 'unknown'}`);
      lastState = state;
    }
    if (blob) {
      log.info(`Bluesky API video processing complete: job=${jobId}`);
      return blob;
    }
    if (isFailedVideoState(state)) {
      throw new Error(`Bluesky video processing failed: ${extractVideoError(status) ?? state ?? 'unknown error'}`);
    }
  }
  throw new Error(`Bluesky video processing timed out after ${VIDEO_PROCESS_TIMEOUT_MS}ms`);
}

async function getVideoJobStatus(jobId: string): Promise<unknown> {
  const url = new URL(`${VIDEO_SERVICE}/xrpc/app.bsky.video.getJobStatus`);
  url.searchParams.set('jobId', jobId);
  const res = await fetch(url.toString(), { method: 'GET' });
  return await parseVideoStatusResponse(res, 'getJobStatus');
}

async function parseVideoStatusResponse(res: Response, label: string): Promise<unknown> {
  const text = await res.text().catch(() => '');
  const parsed = parseJsonObject(text);
  if (!res.ok && !extractVideoBlob(parsed)) {
    const detail = text || JSON.stringify(parsed ?? {});
    throw new Error(`${label} ${res.status}: ${detail.slice(0, 200)}`);
  }
  return parsed ?? {};
}

function parseJsonObject(text: string): unknown {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function extractVideoJobStatus(status: unknown): VideoJobStatus | null {
  if (!status || typeof status !== 'object') return null;
  const obj = status as Record<string, unknown>;
  const nested = obj['jobStatus'];
  if (nested && typeof nested === 'object') return nested as VideoJobStatus;
  return obj as VideoJobStatus;
}

function extractVideoBlob(status: unknown): BlobRef | undefined {
  const job = extractVideoJobStatus(status);
  return job?.blob;
}

function extractVideoJobId(status: unknown): string | undefined {
  const job = extractVideoJobStatus(status);
  return typeof job?.jobId === 'string' ? job.jobId : undefined;
}

function extractVideoState(status: unknown): string | undefined {
  const job = extractVideoJobStatus(status);
  return typeof job?.state === 'string' ? job.state : undefined;
}

function extractVideoError(status: unknown): string | undefined {
  const job = extractVideoJobStatus(status);
  return typeof job?.error === 'string' ? job.error : typeof job?.message === 'string' ? job.message : undefined;
}

function isFailedVideoState(state: string | undefined): boolean {
  return !!state && /fail|error|cancell/i.test(state);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function postViaApi(
  creds: BlueskyCredentials,
  input: ApiPostInput,
  replyTarget?: BlueskyReplyTarget,
): Promise<ApiPostResult & { uri?: string; cid?: string }> {
  try {
    const session = await createSession(creds);
    return await postViaSession(session, input, replyTarget);
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * 既存 Session (createSession 結果 or bsky.app localStorage から読んだ JWT) で
 * post する path。 reply target を渡すと thread 連結 reply として post する。
 *
 * 返却に uri / cid を含める: reply chain で次 chunk の root/parent target に使う。
 */
export async function postViaSession(
  session: Session,
  input: ApiPostInput,
  replyTarget?: BlueskyReplyTarget,
): Promise<ApiPostResult & { uri?: string; cid?: string }> {
  let recordRequestInFlight = false;
  try {
    const pds = session.pdsHost || DEFAULT_PDS;
    const media = input.images ?? [];
    const videos = media.filter((m) => m.type.startsWith('video/'));
    const imageRecords: { alt: string; image: BlobRef }[] = [];
    let videoBlob: BlobRef | undefined;
    let videoAlt = '';
    if (videos.length > 1) {
      throw new Error('Bluesky API video posting supports one video per post');
    }
    if (videos.length === 1) {
      const hasImages = media.some((m) => m.type.startsWith('image/'));
      if (hasImages) {
        throw new Error('Bluesky API video posting cannot combine video and images in one post');
      }
      const video = videos[0]!;
      const bytes = await resolveAttachmentToBytes(video);
      videoBlob = await uploadVideoToService(session, pds, bytes, video.type || 'video/mp4', video.name);
      videoAlt = video.alt ?? '';
    }

    const images = videoBlob ? [] : media.filter((m) => m.type.startsWith('image/')).slice(0, MAX_IMAGES);
    for (const img of images) {
      const bytes = await resolveAttachmentToBytes(img);
      const blob = await uploadBlob(session, pds, bytes, img.type);
      imageRecords.push({ alt: img.alt ?? '', image: blob });
    }

    // facets: #hashtag / bare URL / @mention を clickable にする。 無いと plain text 扱い。
    // mention は did resolve 込み (v0.4.78〜)、 resolve 失敗は plain text としてそのまま。
    const facets = await buildBlueskyFacetsAsync(input.text);
    const record: Record<string, unknown> = {
      $type: 'app.bsky.feed.post',
      text: input.text,
      createdAt: new Date().toISOString(),
      langs: ['ja', 'en'],
      ...(facets.length > 0 ? { facets } : {}),
    };
    if (imageRecords.length > 0) {
      record['embed'] = {
        $type: 'app.bsky.embed.images',
        images: imageRecords,
      };
    } else if (videoBlob) {
      record['embed'] = {
        $type: 'app.bsky.embed.video',
        video: videoBlob,
        ...(videoAlt ? { alt: videoAlt } : {}),
      };
    }
    if (replyTarget) {
      record['reply'] = {
        root: { uri: replyTarget.rootUri, cid: replyTarget.rootCid },
        parent: { uri: replyTarget.parentUri, cid: replyTarget.parentCid },
      };
    }

    recordRequestInFlight = true;
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
      recordRequestInFlight = false;
      const detail = await createRes.text().catch(() => '');
      throw new Error(`createRecord ${createRes.status}: ${detail.slice(0, 200)}`);
    }
    const createData = (await createRes.json()) as { uri?: string; cid?: string };
    // uri 例: at://did:plc:xxx/app.bsky.feed.post/3kxyz
    // 公開 URL: https://bsky.app/profile/<handle>/post/<rkey>
    const rkey = createData.uri?.split('/').pop();
    const postUrl = rkey ? `https://bsky.app/profile/${session.handle}/post/${rkey}` : undefined;
    return { success: true, postUrl, uri: createData.uri, cid: createData.cid };
  } catch (e) {
    return {
      success: false,
      uncertain: recordRequestInFlight || undefined,
      error: e instanceof Error ? e.message : String(e),
    };
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
