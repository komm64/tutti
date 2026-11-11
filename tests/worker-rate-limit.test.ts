import { describe, expect, it } from 'vitest';
import {
  consumeReportQuota,
  DEFAULT_RATE_LIMIT,
  resolveRateLimitConfig,
  type RateLimitStore,
} from '../worker/src/rate-limit';

function memoryStore(): RateLimitStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    async get(key) { return data.get(key) ?? null; },
    async put(key, value) { data.set(key, value); },
  };
}

const NOON = Date.UTC(2026, 10, 12, 12, 0, 0);
const config = { burstSeconds: 6, dailyPerIp: 3, dailyGlobal: 5 };

describe('worker report rate limit', () => {
  it('blocks a second report from the same IP inside the burst window', async () => {
    const store = memoryStore();
    expect(await consumeReportQuota(store, 'a', config, NOON)).toEqual({ ok: true });
    expect(await consumeReportQuota(store, 'a', config, NOON + 5_000))
      .toMatchObject({ ok: false, reason: 'burst' });
    expect(await consumeReportQuota(store, 'a', config, NOON + 6_000)).toEqual({ ok: true });
  });

  it('caps reports per IP per UTC day', async () => {
    const store = memoryStore();
    for (let i = 0; i < 3; i += 1) {
      expect(await consumeReportQuota(store, 'a', config, NOON + i * 10_000)).toEqual({ ok: true });
    }
    expect(await consumeReportQuota(store, 'a', config, NOON + 40_000))
      .toMatchObject({ ok: false, reason: 'daily-ip' });
    expect(await consumeReportQuota(store, 'b', config, NOON + 40_000)).toEqual({ ok: true });
    expect(await consumeReportQuota(store, 'a', config, NOON + 24 * 3600_000)).toEqual({ ok: true });
  });

  it('caps reports across all IPs per UTC day', async () => {
    const store = memoryStore();
    for (let i = 0; i < 5; i += 1) {
      expect(await consumeReportQuota(store, `ip-${i}`, config, NOON)).toEqual({ ok: true });
    }
    expect(await consumeReportQuota(store, 'ip-new', config, NOON))
      .toMatchObject({ ok: false, reason: 'daily-global' });
  });

  it('does not count a rejected report', async () => {
    const store = memoryStore();
    await consumeReportQuota(store, 'a', config, NOON);
    await consumeReportQuota(store, 'a', config, NOON + 1_000);
    expect(store.data.get('daily:global:2026-11-12')).toBe('1');
    expect(store.data.get('daily:a:2026-11-12')).toBe('1');
  });

  it('uses the defaults when env values are missing or invalid', () => {
    expect(resolveRateLimitConfig({})).toEqual(DEFAULT_RATE_LIMIT);
    expect(resolveRateLimitConfig({ DAILY_LIMIT: 'x', GLOBAL_DAILY_LIMIT: '0' }))
      .toEqual(DEFAULT_RATE_LIMIT);
    expect(resolveRateLimitConfig({ DAILY_LIMIT: '7' }).dailyPerIp).toBe(7);
  });
});
