/**
 * Report rate limit backed by a KV namespace.
 *
 * Three limits, checked before any counter moves:
 *   1. burst: one report per IP every `burstSeconds`
 *   2. per-IP daily cap
 *   3. global daily cap, so rotating IPs cannot flood the issue tracker
 *      (the Origin check alone is trivial to forge outside a browser)
 *
 * Days are UTC. KV is eventually consistent, so the caps are approximate,
 * which is enough to bound abuse.
 */

export interface RateLimitStore {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
}

export interface RateLimitConfig {
  burstSeconds: number;
  dailyPerIp: number;
  dailyGlobal: number;
}

export const DEFAULT_RATE_LIMIT: RateLimitConfig = {
  burstSeconds: 6,
  dailyPerIp: 20,
  dailyGlobal: 100,
};

export type RateLimitDecision =
  | { ok: true }
  | { ok: false; reason: 'burst' | 'daily-ip' | 'daily-global'; message: string };

const DAY_TTL_SECONDS = 25 * 3600;

export function resolveRateLimitConfig(env: {
  RATE_LIMIT_SECONDS?: string;
  DAILY_LIMIT?: string;
  GLOBAL_DAILY_LIMIT?: string;
}): RateLimitConfig {
  const positive = (raw: string | undefined, fallback: number): number => {
    const value = Number(raw);
    return Number.isFinite(value) && value > 0 ? value : fallback;
  };
  return {
    burstSeconds: positive(env.RATE_LIMIT_SECONDS, DEFAULT_RATE_LIMIT.burstSeconds),
    dailyPerIp: positive(env.DAILY_LIMIT, DEFAULT_RATE_LIMIT.dailyPerIp),
    dailyGlobal: positive(env.GLOBAL_DAILY_LIMIT, DEFAULT_RATE_LIMIT.dailyGlobal),
  };
}

export async function consumeReportQuota(
  store: RateLimitStore,
  ip: string,
  config: RateLimitConfig,
  now = Date.now(),
): Promise<RateLimitDecision> {
  const today = new Date(now).toISOString().slice(0, 10);
  const burstKey = `ip:${ip}`;
  const ipDailyKey = `daily:${ip}:${today}`;
  const globalDailyKey = `daily:global:${today}`;

  const [lastTs, ipCountRaw, globalCountRaw] = await Promise.all([
    store.get(burstKey),
    store.get(ipDailyKey),
    store.get(globalDailyKey),
  ]);

  if (lastTs && now - Number(lastTs) < config.burstSeconds * 1000) {
    return { ok: false, reason: 'burst', message: 'rate limited, try again later' };
  }
  const ipCount = Number(ipCountRaw ?? '0');
  if (ipCount >= config.dailyPerIp) {
    return {
      ok: false,
      reason: 'daily-ip',
      message: `daily limit reached (${config.dailyPerIp} reports/day per IP). Try again tomorrow.`,
    };
  }
  const globalCount = Number(globalCountRaw ?? '0');
  if (globalCount >= config.dailyGlobal) {
    return {
      ok: false,
      reason: 'daily-global',
      message: 'report service is busy today. Try again tomorrow.',
    };
  }

  // Counted before the GitHub call: a failed upstream call still costs quota,
  // which is the right side to err on for spam.
  await Promise.all([
    store.put(burstKey, String(now), { expirationTtl: 3600 }),
    store.put(ipDailyKey, String(ipCount + 1), { expirationTtl: DAY_TTL_SECONDS }),
    store.put(globalDailyKey, String(globalCount + 1), { expirationTtl: DAY_TTL_SECONDS }),
  ]);
  return { ok: true };
}
