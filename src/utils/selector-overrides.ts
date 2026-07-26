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

/**
 * 動画 constraint の remote override (selectors.json 内の `_videoConstraints` namespace)。
 * Bluesky 100MB → 200MB に変わる等、時期によるグローバル変化を hot-fix で配信する。
 * P17 で追加。
 */
export type VideoConstraintsOverrides = Partial<Record<PlatformId, { maxBytes?: number; maxDurationS?: number }>>;

export const SELECTOR_OVERRIDE_STORAGE_KEYS = {
  selectors: 'selectorOverrides',
  fetchedAt: 'selectorOverridesFetchedAt',
  videoConstraints: 'videoConstraintsOverrides',
  diagnostics: 'selectorFeedDiagnostics',
} as const;

export async function getOverrides(): Promise<SelectorOverrides> {
  const stored = await browser.storage.local.get(SELECTOR_OVERRIDE_STORAGE_KEYS.selectors);
  return (
    stored[SELECTOR_OVERRIDE_STORAGE_KEYS.selectors] as SelectorOverrides | undefined
  ) ?? {};
}

export async function setOverrides(overrides: SelectorOverrides): Promise<void> {
  await browser.storage.local.set({
    [SELECTOR_OVERRIDE_STORAGE_KEYS.selectors]: overrides,
    [SELECTOR_OVERRIDE_STORAGE_KEYS.fetchedAt]: Date.now(),
  });
}

export async function getFetchedAt(): Promise<number | null> {
  const stored = await browser.storage.local.get(SELECTOR_OVERRIDE_STORAGE_KEYS.fetchedAt);
  const v = stored[SELECTOR_OVERRIDE_STORAGE_KEYS.fetchedAt];
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

export async function getVideoConstraintsOverrides(): Promise<VideoConstraintsOverrides> {
  const stored = await browser.storage.local.get(
    SELECTOR_OVERRIDE_STORAGE_KEYS.videoConstraints,
  );
  const overrides = stored[SELECTOR_OVERRIDE_STORAGE_KEYS.videoConstraints] as VideoConstraintsOverrides | undefined;
  return overrides ?? {};
}
