import type { DiagnosePlatformResult, PlatformId } from '../messages';
import type { HistoryEntry } from '../storage';
import { getLastSeenUsers, getPostHistory, getSettings } from '../storage';
import { adapters, getAdapter } from '../adapters/registry';

export interface DiagnosticsReport {
  version: string;
  generatedAt: string;
  userAgent: string;
  settings: Awaited<ReturnType<typeof getSettings>>;
  /** PII 除去済。値は '<present>' のフラグのみ */
  lastSeenUsers: Record<string, string>;
  /** PII 除去済。textPreview は文字数フラグに置換 */
  recentHistory: Array<{
    id: string;
    textPreview: string;
    platforms: PlatformId[];
    results: Partial<Record<PlatformId, { success: boolean; uncertain?: boolean; url?: string; error?: string }>>;
    hasMedia: boolean;
    timestamp: number;
  }>;
  /** PII 除去済。detectedUser は '<present>' or null */
  platforms: DiagnosePlatformResult[];
}

export async function buildDiagnosticsReport(): Promise<DiagnosticsReport> {
  const tabs = await browser.tabs.query({});
  const platformResults: DiagnosePlatformResult[] = [];
  const platformIds = Object.keys(adapters) as PlatformId[];

  for (const tab of tabs) {
    if (typeof tab.url !== 'string' || typeof tab.id !== 'number') continue;
    const platform = platformIds.find((p) => getAdapter(p)?.matchUrl(tab.url ?? ''));
    if (!platform) continue;
    try {
      const res = (await browser.tabs.sendMessage(tab.id, {
        type: 'DIAGNOSE_PLATFORM',
        platform,
      })) as DiagnosePlatformResult | undefined;
      if (res?.type !== 'DIAGNOSE_PLATFORM_RESULT') continue;
      if (!shouldIncludeDiagnosticPlatformResult(res)) continue;
      platformResults.push(res);
    } catch {
      // content script unreachable (= まだ inject されてない or wrong page)。
      // これも compose context じゃないので skip (privacy 寄りの判断)。
    }
  }

  return {
    version: browser.runtime.getManifest().version,
    generatedAt: new Date().toISOString(),
    userAgent: navigator.userAgent,
    settings: await getSettings(),
    lastSeenUsers: redactLastSeenUsers(await getLastSeenUsers()),
    recentHistory: redactHistoryForDiagnostics((await getPostHistory()).slice(0, 5)),
    platforms: redactDiagnosticPlatformResults(platformResults),
  };
}

export function shouldIncludeDiagnosticPlatformResult(
  res: Pick<DiagnosePlatformResult, 'selectors' | 'detectedUser'>,
): boolean {
  // **privacy critical**: compose 系 tab だけ result に含める。
  // 全 selector が miss + detectedUser も無い tab は閲覧 / 視聴ページ等
  // (例: youtube.com/watch?v=xxx)、ユーザの不関係 browsing を public Issue
  // に流してしまう事故 (v0.4.32 で発生) を防ぐ。
  return res.selectors.some((s) => s.matchCount > 0) || !!res.detectedUser;
}

export function redactLastSeenUsers(raw: Record<string, string | null | undefined>): Record<string, string> {
  const redacted: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (v) redacted[k] = '<present>';
  }
  return redacted;
}

export function redactHistoryForDiagnostics(
  history: readonly HistoryEntry[],
): DiagnosticsReport['recentHistory'] {
  return history.map((h) => ({
    id: h.id,
    textPreview: `<redacted ${h.textPreview.length} chars>`,
    platforms: h.platforms,
    // v0.4.88: results に url / error が入るようになったので diagnostics 経路では redact
    // url / error は PII を含み得る (post id / handle) ので public Issue に流さない
    results: Object.fromEntries(
      Object.entries(h.results).map(([k, v]) => [k, { success: v?.success ?? false, uncertain: v?.uncertain ?? false }]),
    ) as DiagnosticsReport['recentHistory'][number]['results'],
    hasMedia: h.hasMedia,
    timestamp: h.timestamp,
  }));
}

export function redactDiagnosticPlatformResults(
  platformResults: readonly DiagnosePlatformResult[],
): DiagnosePlatformResult[] {
  return platformResults.map((p) => ({
    ...p,
    detectedUser: p.detectedUser ? '<present>' : null,
  }));
}
