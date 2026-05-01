import type { DiagnosePlatformResult, PlatformId, SelectorAudit } from '../messages';

/**
 * 各 SNS の content script から呼ぶ汎用 selector audit。
 * カンマ区切りの selector を全部試して、最初にマッチしたものの数と outerHTML 先頭を返す。
 * 全部 0 件のときは matchCount: 0 / preview: null。
 */
export function auditSelector(name: string, selector: string): SelectorAudit {
  let matchCount = 0;
  let firstMatchPreview: string | null = null;
  for (const part of selector.split(',').map((s) => s.trim()).filter(Boolean)) {
    const matches = document.querySelectorAll(part);
    if (matches.length > 0) {
      matchCount = matches.length;
      const first = matches[0] as HTMLElement;
      firstMatchPreview = (first.outerHTML ?? '').slice(0, 200);
      break;
    }
  }
  return { name, selector, matchCount, firstMatchPreview };
}

/**
 * SNS content script から呼ぶ DIAGNOSE_PLATFORM ハンドラ。
 * selectors の各エントリに対して audit を実行、detect 関数も同時に呼んで
 * 構造化された DiagnosePlatformResult を作る。detect が async なら同期版だけ返して
 * 非同期分は省く(診断中なのでブロックしない優先で割り切る)。
 */
export function buildDiagnosis(
  platform: PlatformId,
  selectors: Record<string, string>,
  detectFn: () => string | null | Promise<string | null>,
): DiagnosePlatformResult {
  let detectedUser: string | null = null;
  try {
    const r = detectFn();
    if (typeof r === 'string') detectedUser = r;
    // Promise の場合は待たずに null のまま(診断は早く返したい)
  } catch { /* ignore */ }
  return {
    type: 'DIAGNOSE_PLATFORM_RESULT',
    platform,
    url: location.href,
    selectors: Object.entries(selectors).map(([name, sel]) => auditSelector(name, sel)),
    detectedUser,
  };
}
