export const REPORT_DEDUP_KEY = 'reportDedup';
export const REPORT_DEDUP_WINDOW_MS = 24 * 60 * 60 * 1000;

interface StorageAreaLike {
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}

export async function hashReportKey(errorText: string, subtle: SubtleCrypto = crypto.subtle): Promise<string> {
  const head = errorText.slice(0, 200);
  const buf = new TextEncoder().encode(head);
  const digest = await subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(digest)).slice(0, 8)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * 報告文は失敗 SNS ごとに 1 行ずつ溜まる (`<platform>: <error>`)。全体の先頭だけで
 * hash すると後から増えた SNS の失敗が既報扱いになるので、行ごとに key を作る。
 */
export async function hashReportKeys(errorText: string, subtle: SubtleCrypto = crypto.subtle): Promise<string[]> {
  const lines = [...new Set(errorText.split('\n').map((l) => l.trim()).filter(Boolean))];
  return Promise.all((lines.length > 0 ? lines : [errorText]).map((l) => hashReportKey(l, subtle)));
}

export function recentReportTimestamp(
  map: Record<string, number>,
  hash: string,
  now: number = Date.now(),
  windowMs: number = REPORT_DEDUP_WINDOW_MS,
): number | null {
  const ts = map[hash];
  if (typeof ts !== 'number') return null;
  if (now - ts > windowMs) return null;
  return ts;
}

export function markReportInMap(
  map: Record<string, number>,
  hash: string,
  now: number = Date.now(),
  windowMs: number = REPORT_DEDUP_WINDOW_MS,
): Record<string, number> {
  const next = { ...map };
  for (const k of Object.keys(next)) {
    if (now - (next[k] ?? 0) > windowMs) delete next[k];
  }
  next[hash] = now;
  return next;
}

export async function isRecentlyReported(
  hash: string,
  storage: StorageAreaLike = browser.storage.local,
  now: number = Date.now(),
): Promise<number | null> {
  const stored = await storage.get(REPORT_DEDUP_KEY);
  return recentReportTimestamp(readReportDedupMap(stored), hash, now);
}

/** 全 key が期間内に報告済みならその最新 timestamp、1 つでも未報告なら null */
export async function allRecentlyReported(
  hashes: string[],
  storage: StorageAreaLike = browser.storage.local,
  now: number = Date.now(),
): Promise<number | null> {
  const map = readReportDedupMap(await storage.get(REPORT_DEDUP_KEY));
  let latest: number | null = null;
  for (const hash of hashes) {
    const ts = recentReportTimestamp(map, hash, now);
    if (ts === null) return null;
    latest = Math.max(latest ?? ts, ts);
  }
  return latest;
}

export async function markReported(
  hash: string | string[],
  storage: StorageAreaLike = browser.storage.local,
  now: number = Date.now(),
): Promise<void> {
  const stored = await storage.get(REPORT_DEDUP_KEY);
  let next = readReportDedupMap(stored);
  for (const h of Array.isArray(hash) ? hash : [hash]) next = markReportInMap(next, h, now);
  await storage.set({ [REPORT_DEDUP_KEY]: next });
}

function readReportDedupMap(stored: Record<string, unknown>): Record<string, number> {
  const raw = stored[REPORT_DEDUP_KEY];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  return Object.fromEntries(
    Object.entries(raw as Record<string, unknown>)
      .filter((entry): entry is [string, number] => typeof entry[1] === 'number'),
  );
}
