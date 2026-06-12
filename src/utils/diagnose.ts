import type { DiagnosePlatformResult, PlatformId, SelectorAudit } from '../messages';
import { isKnownComposeUrl } from './compose-url';
import { snapshotDocument } from './dom-snapshot';

/**
 * 各 SNS の content script から呼ぶ汎用 selector audit。
 * カンマ区切りの selector を全部試して、最初にマッチしたものの数と outerHTML 先頭を返す。
 * 全部 0 件のときは matchCount: 0 / preview: null。
 */
/**
 * outerHTML preview の中で href / src / value 等にユーザ閲覧中ページや
 * 入力 text が混入する可能性がある。public Issue に流れる前提で雑 regex で潰す。
 * snapshotDocument 側はもっと堅い redact を持つが、こちらは小さい preview なので
 * 軽量 regex で十分。
 */
function redactPreviewAttrs(html: string): string {
  return html
    .replace(/\b(href|src|srcset|action|formaction|poster|data-image-url)="[^"]{0,800}"/gi, '$1="<u/>"')
    .replace(/\b(value)="[^"]{0,800}"/gi, '$1="<v/>"');
}

export function auditSelector(name: string, selector: string): SelectorAudit {
  let matchCount = 0;
  let firstMatchPreview: string | null = null;
  for (const part of selector.split(',').map((s) => s.trim()).filter(Boolean)) {
    const matches = document.querySelectorAll(part);
    if (matches.length > 0) {
      matchCount = matches.length;
      const first = matches[0] as HTMLElement;
      firstMatchPreview = redactPreviewAttrs((first.outerHTML ?? '').slice(0, 200));
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
  const audits = Object.entries(selectors).map(([name, sel]) => auditSelector(name, sel));
  const hasMiss = audits.some((a) => a.matchCount === 0);
  const hasHit = audits.some((a) => a.matchCount > 0);
  // **privacy critical**: snapshot は **compose 系 page のみ** で取る。
  // - hasHit が 1 つも無い tab = そもそも compose ページじゃない (視聴 / プロフィール
  //   / フィード等)、ユーザの不関係 browsing を public Issue に流さないため snapshot しない
  // - hasHit && hasMiss = compose page で何かが壊れた状態 → snapshot 必要 (本来の用途)
  // - 全 hit (hasMiss=false) = 健全、snapshot 不要 (帯域節約)
  let domSnapshot: string | null = null;
  if (hasMiss && (hasHit || isKnownComposeUrl(platform, location.href))) {
    try {
      domSnapshot = snapshotDocument(8000);
    } catch { /* ignore — 診断は best-effort */ }
  }
  return {
    type: 'DIAGNOSE_PLATFORM_RESULT',
    platform,
    // **privacy critical**: hostname のみ。full href は path / query / fragment が漏れて
    // ユーザの視聴している YouTube 動画 ID / 閲覧中のチャンネルなどが public Issue に
    // 流れる事故 (v0.4.32 で発生)。host は triage に有用 (custom Mastodon 等の判別)
    // なので残すが、それ以上は出さない
    url: location.host,
    selectors: audits,
    detectedUser,
    domSnapshot,
  };
}
