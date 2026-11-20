/**
 * Real-post rate guard for E2E scripts.
 *
 * Automated bursts of real posts get test accounts flagged as bots: on
 * 2026-11-19 a release matrix locked the X test account into permanent
 * read-only mode and Misskey flagged its account. Every script that sends
 * real posts (autoPost: true) must go through this guard.
 *
 * Limits, per platform:
 *   - at most MAX_POSTS_PER_DAY real-post requests in any rolling 24h
 *   - at least MIN_INTERVAL_MS between two requests (the guard waits)
 *
 * Requests are recorded in a ledger outside the repo, so the limits hold
 * across runs and scripts. `--allow-post-burst` skips the limits (the request
 * is still recorded); use it only when the user explicitly asked for it.
 */

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

export const MAX_POSTS_PER_DAY = 3;
export const MIN_INTERVAL_MS = 30 * 60_000;
export const ALLOW_BURST_FLAG = '--allow-post-burst';

const DAY_MS = 24 * 60 * 60_000;
const LEDGER_KEEP_MS = 7 * DAY_MS;

export const DEFAULT_LIMITS = Object.freeze({
  maxPerDay: MAX_POSTS_PER_DAY,
  minIntervalMs: MIN_INTERVAL_MS,
});

export function defaultLedgerPath(env = process.env) {
  if (env.TUTTI_REAL_POST_LEDGER) return env.TUTTI_REAL_POST_LEDGER;
  const base = env.LOCALAPPDATA ?? join(homedir(), '.local', 'state');
  return join(base, 'tutti-e2e', 'real-post-ledger.json');
}

/** Requests for `platform` inside the rolling 24h window ending at `now`. */
export function postsInLastDay(ledger, platform, now) {
  return ledger.filter((entry) => entry.platform === platform && now - entry.at < DAY_MS);
}

/**
 * Platforms whose planned request count would exceed the daily cap.
 * `planned` maps platform -> number of requests this run will send.
 */
export function findBudgetViolations(ledger, planned, now, limits = DEFAULT_LIMITS) {
  const violations = [];
  for (const [platform, count] of Object.entries(planned)) {
    if (count <= 0) continue;
    const used = postsInLastDay(ledger, platform, now).length;
    if (used + count > limits.maxPerDay) {
      violations.push({ platform, used, planned: count, max: limits.maxPerDay });
    }
  }
  return violations;
}

/** Earliest time a new request to `platform` is allowed (<= now means now). */
export function nextAllowedAt(ledger, platform, now, limits = DEFAULT_LIMITS) {
  const recent = postsInLastDay(ledger, platform, now);
  if (recent.length === 0) return now;
  const last = Math.max(...recent.map((entry) => entry.at));
  return last + limits.minIntervalMs;
}

export function formatViolations(violations) {
  return violations
    .map((v) => `${v.platform}: ${v.used} in the last 24h + ${v.planned} planned > ${v.max}`)
    .join('; ');
}

export function createRealPostGuard({
  ledgerPath = defaultLedgerPath(),
  limits = DEFAULT_LIMITS,
  allowBurst = false,
  now = () => Date.now(),
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  log = (message) => console.log(`[real-post-guard] ${message}`),
} = {}) {
  const readLedger = async () => {
    try {
      const parsed = JSON.parse(await readFile(ledgerPath, 'utf8'));
      return Array.isArray(parsed) ? parsed.filter((e) => e && typeof e.at === 'number') : [];
    } catch (error) {
      if (error?.code === 'ENOENT') return [];
      throw new Error(`cannot read real-post ledger ${ledgerPath}: ${error.message}`);
    }
  };

  const writeLedger = async (ledger) => {
    const cutoff = now() - LEDGER_KEEP_MS;
    const kept = ledger.filter((entry) => entry.at >= cutoff);
    await mkdir(dirname(ledgerPath), { recursive: true });
    const tmp = `${ledgerPath}.tmp`;
    await writeFile(tmp, `${JSON.stringify(kept, null, 2)}\n`);
    await rename(tmp, ledgerPath);
  };

  return {
    ledgerPath,
    allowBurst,

    /** Fail fast before any post when the whole run would exceed the cap. */
    async assertBudget(planned) {
      const violations = findBudgetViolations(await readLedger(), planned, now(), limits);
      if (violations.length === 0) return;
      const detail = formatViolations(violations);
      if (allowBurst) {
        log(`${ALLOW_BURST_FLAG}: daily cap exceeded and ignored (${detail})`);
        return;
      }
      throw new Error(
        `real-post daily cap exceeded (${detail}). Reduce --cases/--platforms/--repeat ` +
        `or wait; ${ALLOW_BURST_FLAG} overrides only when the user asked for it. ` +
        `Ledger: ${ledgerPath}`,
      );
    },

    /**
     * Wait until every platform may post, then record one request each.
     * Call immediately before sending the real-post request.
     */
    async beforePost(platforms, label = '') {
      let ledger = await readLedger();
      const violations = findBudgetViolations(
        ledger,
        Object.fromEntries(platforms.map((p) => [p, 1])),
        now(),
        limits,
      );
      if (violations.length > 0 && !allowBurst) {
        throw new Error(`real-post daily cap exceeded (${formatViolations(violations)}). Ledger: ${ledgerPath}`);
      }
      if (!allowBurst) {
        const waitUntil = Math.max(...platforms.map((p) => nextAllowedAt(ledger, p, now(), limits)));
        const waitMs = waitUntil - now();
        if (waitMs > 0) {
          log(`waiting ${Math.ceil(waitMs / 60_000)} min before posting ${label} to ${platforms.join(',')} (min interval ${limits.minIntervalMs / 60_000} min)`);
          await sleep(waitMs);
          ledger = await readLedger();
        }
      }
      const at = now();
      await writeLedger([...ledger, ...platforms.map((platform) => ({ platform, at, label }))]);
    },
  };
}

/**
 * One-shot helper for scripts that send a single real-post request: honours
 * --allow-post-burst from argv, waits for the interval, enforces the cap and
 * records the request.
 */
export async function guardRealPostRequest(platforms, label, { argv = process.argv } = {}) {
  const guard = createRealPostGuard({ allowBurst: argv.includes(ALLOW_BURST_FLAG) });
  await guard.beforePost(platforms, label);
}
