/**
 * 動画 upload 制限の API probe (P17)。
 *
 * 各 SNS が公開している「ユーザー / instance 固有の動画上限」を実際に問い合わせる。
 * - Bluesky: `app.bsky.video.getUploadLimits` (認証要、ユーザー固有の残量を返す)
 * - Mastodon: `GET /api/v1/instance` (認証不要、instance 全体の上限)
 * - Misskey: `POST /api/meta` (認証不要、instance 全体の上限)
 *
 * X / Threads / IG / TikTok / YouTube は public probe なし。default + override で対応。
 *
 * 結果は `chrome.storage.local` の `videoLimitsCache` に 24h cache。
 */

import type { BlueskyCredentials, MastodonCredentials, MisskeyCredentials } from '../utils/api-credentials';

export interface ProbedLimits {
  /** byte */
  maxBytes?: number;
  /** 秒 */
  maxDurationS?: number;
  /** epoch ms */
  fetchedAt: number;
  /** 失敗 reason (debug 用)。成功時 undefined */
  error?: string;
}

const DEFAULT_BLUESKY_PDS = 'https://bsky.social';

export async function probeBluesky(creds: BlueskyCredentials): Promise<ProbedLimits> {
  const pds = creds.pdsHost || DEFAULT_BLUESKY_PDS;
  // 認証セッション (App Password で短期 JWT 発行)
  const sessionRes = await fetch(`${pds}/xrpc/com.atproto.server.createSession`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: creds.identifier, password: creds.appPassword }),
  });
  if (!sessionRes.ok) {
    return { fetchedAt: Date.now(), error: `createSession ${sessionRes.status}` };
  }
  const session = (await sessionRes.json()) as { accessJwt?: string };
  if (!session.accessJwt) return { fetchedAt: Date.now(), error: 'no accessJwt' };

  const limitsRes = await fetch(`${pds}/xrpc/app.bsky.video.getUploadLimits`, {
    headers: { Authorization: `Bearer ${session.accessJwt}` },
  });
  if (!limitsRes.ok) {
    return { fetchedAt: Date.now(), error: `getUploadLimits ${limitsRes.status}` };
  }
  const data = (await limitsRes.json()) as {
    canUpload?: boolean;
    remainingDailyVideos?: number;
    remainingDailyBytes?: number;
    message?: string;
  };
  // remainingDailyBytes は「今日まだ upload できる byte 数」。1 投稿あたりの上限は
  // ATProto では明示されていない (実態は 100MB+) ため、remaining を上限として扱う。
  // 値が 0 なら upload 不可だが maxBytes=0 だと制約 check が誤動作するので skip。
  if (typeof data.remainingDailyBytes === 'number' && data.remainingDailyBytes > 0) {
    return { fetchedAt: Date.now(), maxBytes: data.remainingDailyBytes };
  }
  return { fetchedAt: Date.now(), error: data.message ?? 'no remainingDailyBytes' };
}

export async function probeMastodon(creds: MastodonCredentials): Promise<ProbedLimits> {
  // /api/v2/instance は認証不要だが acccess token があれば送る (ratelimit 緩和等)
  const res = await fetch(`${creds.instance}/api/v2/instance`, {
    headers: creds.accessToken ? { Authorization: `Bearer ${creds.accessToken}` } : {},
  });
  if (!res.ok) {
    return { fetchedAt: Date.now(), error: `instance ${res.status}` };
  }
  const data = (await res.json()) as {
    configuration?: {
      media_attachments?: {
        video_size_limit?: number;
        video_duration_limit?: number;
      };
    };
  };
  const cfg = data.configuration?.media_attachments;
  return {
    fetchedAt: Date.now(),
    maxBytes: cfg?.video_size_limit,
    maxDurationS: cfg?.video_duration_limit,
  };
}

export async function probeMisskey(creds: MisskeyCredentials): Promise<ProbedLimits> {
  const res = await fetch(`${creds.instance}/api/meta`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ detail: false }),
  });
  if (!res.ok) {
    return { fetchedAt: Date.now(), error: `meta ${res.status}` };
  }
  const data = (await res.json()) as {
    /** 全 file 最大 size。Misskey は動画 / 画像で別管理せず一律 */
    maxFileSize?: number;
    /** instance ごとのオプショナルな個別動画上限 (一部 fork のみ) */
    maxVideoDuration?: number;
  };
  return {
    fetchedAt: Date.now(),
    maxBytes: data.maxFileSize,
    maxDurationS: data.maxVideoDuration,
  };
}
