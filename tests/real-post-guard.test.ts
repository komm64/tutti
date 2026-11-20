import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createRealPostGuard,
  findBudgetViolations,
  nextAllowedAt,
} from '../scripts/e2e/real-post-guard.mjs';

const MIN = 60_000;
const HOUR = 60 * MIN;
const limits = { maxPerDay: 3, minIntervalMs: 30 * MIN };

describe('real-post guard (pure)', () => {
  const now = 100 * HOUR;

  it('counts only the rolling 24h window per platform', () => {
    const ledger = [
      { platform: 'x', at: now - 25 * HOUR },
      { platform: 'x', at: now - 2 * HOUR },
      { platform: 'x', at: now - 1 * HOUR },
      { platform: 'bluesky', at: now - 1 * HOUR },
    ];
    expect(findBudgetViolations(ledger, { x: 1 }, now, limits)).toEqual([]);
    expect(findBudgetViolations(ledger, { x: 2, bluesky: 2 }, now, limits)).toEqual([
      { platform: 'x', used: 2, planned: 2, max: 3 },
    ]);
  });

  it('enforces the minimum interval from the latest request', () => {
    const ledger = [{ platform: 'x', at: now - 10 * MIN }];
    expect(nextAllowedAt(ledger, 'x', now, limits)).toBe(now + 20 * MIN);
    expect(nextAllowedAt(ledger, 'misskey', now, limits)).toBe(now);
  });
});

describe('real-post guard (ledger)', () => {
  let dir: string;
  let clock: number;
  let slept: number[];

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'real-post-guard-'));
    clock = 100 * HOUR;
    slept = [];
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  const makeGuard = (allowBurst = false) => createRealPostGuard({
    ledgerPath: join(dir, 'ledger.json'),
    limits,
    allowBurst,
    now: () => clock,
    sleep: async (ms) => {
      slept.push(ms);
      clock += ms;
    },
    log: () => {},
  });

  it('waits between requests and rejects past the daily cap', async () => {
    const guard = makeGuard();
    await guard.beforePost(['x'], 'a');
    clock += 5 * MIN;
    await guard.beforePost(['x'], 'b');
    expect(slept).toEqual([25 * MIN]);
    await guard.beforePost(['x'], 'c');
    await expect(guard.beforePost(['x'], 'd')).rejects.toThrow(/daily cap/);
    await expect(guard.assertBudget({ x: 1 })).rejects.toThrow(/daily cap/);
    const ledger = JSON.parse(await readFile(join(dir, 'ledger.json'), 'utf8'));
    expect(ledger.map((e: { label: string }) => e.label)).toEqual(['a', 'b', 'c']);
  });

  it('assertBudget rejects a run that plans too many posts up front', async () => {
    await expect(makeGuard().assertBudget({ x: 4 })).rejects.toThrow(/x: 0 in the last 24h \+ 4 planned > 3/);
  });

  it('allowBurst skips limits but still records', async () => {
    const guard = makeGuard(true);
    await guard.assertBudget({ x: 10 });
    for (let i = 0; i < 5; i += 1) await guard.beforePost(['x']);
    expect(slept).toEqual([]);
    const ledger = JSON.parse(await readFile(join(dir, 'ledger.json'), 'utf8'));
    expect(ledger).toHaveLength(5);
  });
});
