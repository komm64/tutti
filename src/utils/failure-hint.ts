/**
 * 投稿失敗時の「なぜ失敗 / どう直す」 hint mapping (v0.4.86〜)。
 *
 * user の北極星: 「最初に指定した全 SNS に投稿完了する」。 途中で迷子にしないため、
 * 失敗 SNS に対して "次にやるべきこと" を 1 つ提案する。
 *
 * error string を category 分類して、 (icon / 説明 / CTA) を返す。
 * popup の失敗行から呼ばれて tooltip / inline で表示する。
 */

import type { PlatformId } from '../messages';
import { t } from './i18n';

export type FailureHintCta =
  | { kind: 'open-sns'; label: string; url: string }
  | { kind: 'retry'; label: string }
  | { kind: 'report'; label: string }
  | { kind: 'wait'; label: string }; // user に時間を取ってもらう (captcha 等)

export interface FailureHint {
  /** 1 行の理由 (user に直接 見せる短い文) */
  reason: string;
  /** 復旧手順の説明 (1-3 行) */
  guidance: string;
  /** 推奨アクション (popup ボタンとして並べる、 順序通り) */
  ctas: FailureHintCta[];
}

/**
 * error message + platform から hint を組み立てる。
 * pattern マッチで category 判定、 不明なら generic な hint を返す。
 */
export function classifyFailure(
  error: string,
  platform: PlatformId,
  loginUrl: string | undefined,
): FailureHint {
  const e = error.toLowerCase();

  // ── ログイン必要 ─────────────────────────────────────────────
  if (
    /login|signin|sign in|ログイン|未ログイン|auth(?:enticat)?|unauthorized|401/.test(e) ||
    /投稿入力欄が見つかりません/.test(error)
  ) {
    return {
      reason: t('failureReasonLogin'),
      guidance: t('failureGuidanceLogin', platform),
      ctas: [
        ...(loginUrl ? [{ kind: 'open-sns' as const, label: t('failureCtaOpenSns', platform), url: loginUrl }] : []),
        { kind: 'retry' as const, label: t('failureCtaRetry') },
      ],
    };
  }

  // ── アカウント不一致 (multi-account 誤爆 guard) ────────────────
  if (/アカウント|account/.test(e) && /想定|expected|mismatch|違い|switch/.test(e)) {
    return {
      reason: t('failureReasonAccountMismatch'),
      guidance: t('failureGuidanceAccountMismatch', platform),
      ctas: [
        ...(loginUrl ? [{ kind: 'open-sns' as const, label: t('failureCtaOpenSns', platform), url: loginUrl }] : []),
        { kind: 'retry' as const, label: t('failureCtaRetryAfterAccount') },
      ],
    };
  }

  // ── captcha / security check (Pixiv 等) ──────────────────────
  if (/captcha|recaptcha|security check|セキュリティチェック|verify you are human/.test(e)) {
    return {
      reason: t('failureReasonCaptcha'),
      guidance: t('failureGuidanceCaptcha', platform),
      ctas: [
        ...(loginUrl ? [{ kind: 'open-sns' as const, label: t('failureCtaOpenSns', platform), url: loginUrl }] : []),
        { kind: 'retry' as const, label: t('failureCtaRetryAfterCaptcha') },
      ],
    };
  }

  // ── サイズ / 尺 オーバー ───────────────────────────────────
  if (/too\s*(?:large|big|long)|over.*limit|exceed|オーバー|超えて|maxbytes|maxduration/.test(e)) {
    return {
      reason: t('failureReasonMediaLimit'),
      guidance: t('failureGuidanceMediaLimit'),
      ctas: [
        { kind: 'retry' as const, label: t('failureCtaRetry') },
      ],
    };
  }

  // ── タイムアウト / network ────────────────────────────────
  if (/timeout|timed?\s*out|network|読み込みがタイムアウト|応答がありません/.test(e)) {
    return {
      reason: t('failureReasonTimeout'),
      guidance: t('failureGuidanceTimeout'),
      ctas: [
        { kind: 'retry' as const, label: t('failureCtaRetry') },
      ],
    };
  }

  // ── 重複投稿 / rate-limit (X 等) ───────────────────────────
  if (/duplicate|rate\s*limit|too\s*many\s*requests|429|same\s*tweet/.test(e)) {
    return {
      reason: t('failureReasonDuplicate'),
      guidance: t('failureGuidanceDuplicate'),
      ctas: [
        { kind: 'wait' as const, label: t('failureCtaWaitFiveMinutes') },
      ],
    };
  }

  // ── selector が見つからない (UI 変更?) ──────────────────────
  if (/selector|見つかりません|not found|UI が更新された/.test(e)) {
    return {
      reason: t('failureReasonSelector'),
      guidance: t('failureGuidanceSelector'),
      ctas: [
        { kind: 'report' as const, label: t('errorReportButton') },
        { kind: 'retry' as const, label: t('failureCtaRetry') },
      ],
    };
  }

  // ── 未分類 ────────────────────────────────────────────────
  return {
    reason: t('failureReasonUnknown'),
    guidance: error.slice(0, 200) || t('failureNoDetails'),
    ctas: [
      { kind: 'retry' as const, label: t('failureCtaRetry') },
      { kind: 'report' as const, label: t('errorReportButton') },
    ],
  };
}
