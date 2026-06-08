import { describe, expect, it } from 'vitest';
import {
  REPORT_DEDUP_KEY,
  REPORT_DEDUP_WINDOW_MS,
  hashReportKey,
  isRecentlyReported,
  markReportInMap,
  markReported,
  recentReportTimestamp,
} from './report-dedup';

describe('hashReportKey', () => {
  it('is stable and only uses the first 200 characters', async () => {
    const head = 'x'.repeat(200);
    await expect(hashReportKey(`${head}a`)).resolves.toBe(await hashReportKey(`${head}b`));
  });

  it('changes when the error head changes', async () => {
    await expect(hashReportKey('a')).resolves.not.toBe(await hashReportKey('b'));
  });
});

describe('recentReportTimestamp', () => {
  it('returns recent timestamps', () => {
    expect(recentReportTimestamp({ h: 1000 }, 'h', 1000 + REPORT_DEDUP_WINDOW_MS)).toBe(1000);
  });

  it('ignores expired and missing timestamps', () => {
    expect(recentReportTimestamp({ h: 1000 }, 'h', 1001 + REPORT_DEDUP_WINDOW_MS)).toBeNull();
    expect(recentReportTimestamp({}, 'h', 1000)).toBeNull();
  });
});

describe('markReportInMap', () => {
  it('prunes expired entries and records the new hash', () => {
    const next = markReportInMap({
      fresh: 1000,
      stale: 999,
    }, 'new', 1000 + REPORT_DEDUP_WINDOW_MS, REPORT_DEDUP_WINDOW_MS);

    expect(next).toEqual({
      fresh: 1000,
      new: 1000 + REPORT_DEDUP_WINDOW_MS,
    });
  });
});

describe('storage helpers', () => {
  it('reads and writes the report dedup map through storage', async () => {
    const storageState: Record<string, unknown> = {
      [REPORT_DEDUP_KEY]: { old: 1000, ignored: 'bad' },
    };
    const storage = {
      async get(key: string): Promise<Record<string, unknown>> {
        return { [key]: storageState[key] };
      },
      async set(items: Record<string, unknown>): Promise<void> {
        Object.assign(storageState, items);
      },
    };

    await expect(isRecentlyReported('old', storage, 2000)).resolves.toBe(1000);
    await markReported('new', storage, 3000);
    expect(storageState[REPORT_DEDUP_KEY]).toEqual({ old: 1000, new: 3000 });
  });
});
