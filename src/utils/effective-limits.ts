/**
 * 動画 constraint の有効値解決 (P17)。
 *
 * 優先順:
 *   1. API probe cache (24h fresh) — ユーザー / instance 固有の最新値
 *   2. Remote override (selectors.json の `_videoConstraints`) — 時期によるグローバル変化
 *   3. Adapter default — code 同梱の最終 fallback
 *
 * cache が stale (>24h) な場合は cache を返しつつ background で probe を再実行する
 * (= post latency を増やさない、次回反映)。
 */

import type { PlatformId } from '../messages';
import type { VideoConstraints } from '../adapters/types';
import { getApiCredentials } from './api-credentials';
import { getVideoConstraintsOverrides } from './selector-overrides';
import {
  probeBluesky,
  probeMastodon,
  probeMisskey,
  type ProbedLimits,
} from '../api/limits-probe';

const CACHE_KEY = 'videoLimitsCache';
const TTL_MS = 24 * 60 * 60 * 1000;

type CacheEntry = ProbedLimits;
type Cache = Partial<Record<PlatformId, CacheEntry>>;

async function readCache(): Promise<Cache> {
  const stored = await browser.storage.local.get(CACHE_KEY);
  return (stored[CACHE_KEY] as Cache | undefined) ?? {};
}

async function writeCache(c: Cache): Promise<void> {
  await browser.storage.local.set({ [CACHE_KEY]: c });
}

async function probePlatform(platform: PlatformId): Promise<ProbedLimits | null> {
  const creds = await getApiCredentials();
  try {
    if (platform === 'bluesky' && creds.bluesky) return await probeBluesky(creds.bluesky);
    if (platform === 'mastodon' && creds.mastodon) return await probeMastodon(creds.mastodon);
    if (platform === 'misskey' && creds.misskey) return await probeMisskey(creds.misskey);
  } catch (e) {
    return { fetchedAt: Date.now(), error: e instanceof Error ? e.message : String(e) };
  }
  return null;
}

async function refreshAndCache(platform: PlatformId): Promise<ProbedLimits | null> {
  const result = await probePlatform(platform);
  if (!result) return null;
  const cache = await readCache();
  cache[platform] = result;
  await writeCache(cache);
  return result;
}

/**
 * post 直前に呼ぶ。defaults を起点に override → probe で上書きしていく。
 *
 * @param defaults adapter.videoConstraints の値
 */
export async function getEffectiveVideoConstraints(
  platform: PlatformId,
  defaults: VideoConstraints,
): Promise<VideoConstraints> {
  let result: VideoConstraints = { ...defaults };

  // Layer 2: remote override
  const overrides = await getVideoConstraintsOverrides();
  const o = overrides[platform];
  if (o) {
    if (typeof o.maxBytes === 'number') result.maxBytes = o.maxBytes;
    if (typeof o.maxDurationS === 'number') result.maxDurationS = o.maxDurationS;
  }

  // Layer 1: API probe cache (override より新しい)
  const cache = await readCache();
  const cached = cache[platform];
  if (cached && !cached.error) {
    if (Date.now() - cached.fetchedAt > TTL_MS) {
      // 古い → fire-and-forget で更新、今回は cache 値で続行
      void refreshAndCache(platform).catch(() => { /* ignore */ });
    }
    if (typeof cached.maxBytes === 'number') result.maxBytes = cached.maxBytes;
    if (typeof cached.maxDurationS === 'number') result.maxDurationS = cached.maxDurationS;
  } else {
    // cache 無し → 今回 sync で probe してみる (初回のみ post に ~100-300ms 追加)
    const fresh = await refreshAndCache(platform);
    if (fresh && !fresh.error) {
      if (typeof fresh.maxBytes === 'number') result.maxBytes = fresh.maxBytes;
      if (typeof fresh.maxDurationS === 'number') result.maxDurationS = fresh.maxDurationS;
    }
  }

  return result;
}
