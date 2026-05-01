/**
 * SNS UI が変わったときに拡張更新を待たずに selector を入れ替えるための仕組み。
 *
 * - default は src/adapters/*.ts 内の `*_SELECTORS` 定数(コード同梱)
 * - override は chrome.storage.local に保存(リモート fetch / options 画面で編集)
 * - 各 content script は runPost 直前に `resolveSelectors` で merge して使う
 *
 * Schema (selectorOverrides storage key):
 * ```
 * { x?: { fileInput?: string, ... }, mastodon?: { ... }, ... }
 * ```
 */
import type { PlatformId } from '../messages';

export type SelectorOverrides = Partial<Record<PlatformId, Record<string, string>>>;

const STORAGE_KEY = 'selectorOverrides';
const STORAGE_FETCHED_AT_KEY = 'selectorOverridesFetchedAt';

export async function getOverrides(): Promise<SelectorOverrides> {
  const stored = await browser.storage.local.get(STORAGE_KEY);
  return (stored[STORAGE_KEY] as SelectorOverrides | undefined) ?? {};
}

export async function setOverrides(overrides: SelectorOverrides): Promise<void> {
  await browser.storage.local.set({
    [STORAGE_KEY]: overrides,
    [STORAGE_FETCHED_AT_KEY]: Date.now(),
  });
}

export async function getFetchedAt(): Promise<number | null> {
  const stored = await browser.storage.local.get(STORAGE_FETCHED_AT_KEY);
  const v = stored[STORAGE_FETCHED_AT_KEY];
  return typeof v === 'number' ? v : null;
}

/**
 * defaults と override をマージして effective selectors を返す。
 * default key は維持され、override が同 key を持てば置換、それ以外は default。
 * override 専用 key は無視(taipo/誤キー混入を default で守る)。
 */
export async function resolveSelectors<T extends Record<string, string>>(
  platform: PlatformId,
  defaults: T,
): Promise<T> {
  const overrides = await getOverrides();
  const platformOverride = overrides[platform] ?? {};
  const merged = { ...defaults } as T;
  for (const k of Object.keys(defaults) as (keyof T)[]) {
    const v = platformOverride[k as string];
    if (typeof v === 'string' && v.length > 0) (merged as Record<string, string>)[k as string] = v;
  }
  return merged;
}

/**
 * リモート URL から override JSON を取得して保存。
 * URL が無効・JSON が不正な場合は false を返して overrides を変更しない(安全側)。
 */
export async function fetchOverridesFrom(url: string): Promise<{ ok: boolean; error?: string; count?: number }> {
  if (!url || !/^https:\/\//.test(url)) {
    return { ok: false, error: 'URL は https:// から始まる必要があります' };
  }
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    const data = (await res.json()) as unknown;
    if (typeof data !== 'object' || data === null || Array.isArray(data)) {
      return { ok: false, error: 'JSON はオブジェクト形式が必要です' };
    }
    // 簡易バリデーション: 各 platform のオブジェクトの値はすべて string
    const valid: SelectorOverrides = {};
    let count = 0;
    for (const [platform, val] of Object.entries(data as Record<string, unknown>)) {
      if (!val || typeof val !== 'object' || Array.isArray(val)) continue;
      const inner: Record<string, string> = {};
      for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
        if (typeof v === 'string' && v.length > 0) {
          inner[k] = v;
          count++;
        }
      }
      if (Object.keys(inner).length > 0) valid[platform as PlatformId] = inner;
    }
    await setOverrides(valid);
    return { ok: true, count };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
