/**
 * 投稿失敗時の「なぜ失敗 / どう直す」 hint mapping (v0.4.86〜)。
 *
 * user の北極星: 「最初に指定した全 SNS に投稿完了する」。 途中で迷子にしないため、
 * 失敗 SNS に対して "次にやるべきこと" を 1 つ提案する。
 *
 * error string を category 分類して、 (icon / 説明 / CTA) を返す。
 * popup の失敗行から呼ばれて tooltip / inline で表示する。
 */

import type { PlatformId, PostResultMessage } from '../messages';
import { t } from './i18n';

type RecoveryAction = NonNullable<PostResultMessage['userAction']>;

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
  userAction?: RecoveryAction,
): FailureHint {
  const e = error.toLowerCase();

  if (userAction) {
    const structured = classifyUserAction(userAction, platform, loginUrl);
    if (structured) return structured;
  }

  // ── ログイン必要 ─────────────────────────────────────────────
  if (
    /login|signin|sign in|ログイン|未ログイン|auth(?:enticat)?|unauthorized|401/.test(e) || // allow-jp
    /投稿入力欄が見つかりません/.test(error) // allow-jp
  ) {
    return {
      reason: t('failureReasonLogin'),
      guidance: t('failureGuidanceLogin', platform),
      ctas: [
        ...(loginUrl ? [{ kind: 'open-sns' as const, label: t('failureCtaOpenSns', platform), url: loginUrl }] : []),
        { kind: 'retry' as const, label: t('failureCtaRetry') },
        { kind: 'report' as const, label: t('errorReportButton') },
      ],
    };
  }

  // ── post action 後の確認不能 ────────────────────────────────
  if (/could not confirm|confirm the resulting post|投稿後の確認|重複投稿を避ける/.test(e)) { // allow-jp
    return {
      reason: t('failureReasonPostUncertain'),
      guidance: t('failureGuidancePostUncertain', platform),
      ctas: [
        ...(loginUrl ? [{ kind: 'open-sns' as const, label: t('failureCtaOpenSns', platform), url: loginUrl }] : []),
        { kind: 'report' as const, label: t('errorReportButton') },
      ],
    };
  }

  // ── ユーザーがタブを前面化 / 手動確認する必要がある ───────────────
  if (/active tab|foreground|bring.*tab|focus.*tab|background tab|タブ.*前面|アクティブ/.test(e)) { // allow-jp
    return {
      reason: t('failureReasonManualAction'),
      guidance: t('failureGuidanceActiveTab', platform),
      ctas: [
        ...(loginUrl ? [{ kind: 'open-sns' as const, label: t('failureCtaOpenSns', platform), url: loginUrl }] : []),
        { kind: 'retry' as const, label: t('failureCtaRetry') },
        { kind: 'report' as const, label: t('errorReportButton') },
      ],
    };
  }

  if (/confirmation|confirm|manual action|操作が必要|確認操作/.test(e)) { // allow-jp
    return {
      reason: t('failureReasonManualAction'),
      guidance: t('failureGuidanceConfirmation', platform),
      ctas: [
        ...(loginUrl ? [{ kind: 'open-sns' as const, label: t('failureCtaOpenSns', platform), url: loginUrl }] : []),
        { kind: 'retry' as const, label: t('failureCtaRetry') },
        { kind: 'report' as const, label: t('errorReportButton') },
      ],
    };
  }

  // ── アカウント不一致 (multi-account 誤爆 guard) ────────────────
  if (/アカウント|account/.test(e) && /想定|expected|mismatch|違い|switch/.test(e)) { // allow-jp
    return {
      reason: t('failureReasonAccountMismatch'),
      guidance: t('failureGuidanceAccountMismatch', platform),
      ctas: [
        ...(loginUrl ? [{ kind: 'open-sns' as const, label: t('failureCtaOpenSns', platform), url: loginUrl }] : []),
        { kind: 'retry' as const, label: t('failureCtaRetryAfterAccount') },
        { kind: 'report' as const, label: t('errorReportButton') },
      ],
    };
  }

  // ── captcha / security check (Pixiv 等) ──────────────────────
  if (/captcha|recaptcha|security check|セキュリティチェック|verify you are human/.test(e)) { // allow-jp
    return {
      reason: t('failureReasonCaptcha'),
      guidance: t('failureGuidanceCaptcha', platform),
      ctas: [
        ...(loginUrl ? [{ kind: 'open-sns' as const, label: t('failureCtaOpenSns', platform), url: loginUrl }] : []),
        { kind: 'retry' as const, label: t('failureCtaRetryAfterCaptcha') },
        { kind: 'report' as const, label: t('errorReportButton') },
      ],
    };
  }

  // ── サイズ / 尺 オーバー ───────────────────────────────────
  if (/too\s*(?:large|big|long)|over.*limit|exceed|オーバー|超えて|maxbytes|maxduration/.test(e)) { // allow-jp
    return {
      reason: t('failureReasonMediaLimit'),
      guidance: t('failureGuidanceMediaLimit'),
      ctas: [
        { kind: 'retry' as const, label: t('failureCtaRetry') },
        { kind: 'report' as const, label: t('errorReportButton') },
      ],
    };
  }

  // ── タイムアウト / network ────────────────────────────────
  if (/timeout|timed?\s*out|network|読み込みがタイムアウト|応答がありません/.test(e)) { // allow-jp
    return {
      reason: t('failureReasonTimeout'),
      guidance: t('failureGuidanceTimeout'),
      ctas: [
        { kind: 'retry' as const, label: t('failureCtaRetry') },
        { kind: 'report' as const, label: t('errorReportButton') },
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
        { kind: 'report' as const, label: t('errorReportButton') },
      ],
    };
  }

  // ── selector が見つからない (UI 変更?) ──────────────────────
  if (/selector|見つかりません|not found|UI が更新された/.test(e)) { // allow-jp
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

function classifyUserAction(
  action: RecoveryAction,
  platform: PlatformId,
  loginUrl: string | undefined,
): FailureHint | null {
  const open = loginUrl ? [{ kind: 'open-sns' as const, label: t('failureCtaOpenSns', platform), url: loginUrl }] : [];
  if (action === 'sign-in') {
    return {
      reason: t('failureReasonLogin'),
      guidance: t('failureGuidanceLogin', platform),
      ctas: [...open, { kind: 'retry' as const, label: t('failureCtaRetry') }, { kind: 'report' as const, label: t('errorReportButton') }],
    };
  }
  if (action === 'check-account') {
    return {
      reason: t('failureReasonAccountMismatch'),
      guidance: t('failureGuidanceAccountMismatch', platform),
      ctas: [...open, { kind: 'retry' as const, label: t('failureCtaRetryAfterAccount') }, { kind: 'report' as const, label: t('errorReportButton') }],
    };
  }
  if (action === 'complete-captcha') {
    return {
      reason: t('failureReasonCaptcha'),
      guidance: t('failureGuidanceCaptcha', platform),
      ctas: [...open, { kind: 'retry' as const, label: t('failureCtaRetryAfterCaptcha') }, { kind: 'report' as const, label: t('errorReportButton') }],
    };
  }
  if (action === 'complete-confirmation') {
    return {
      reason: t('failureReasonManualAction'),
      guidance: t('failureGuidanceConfirmation', platform),
      ctas: [...open, { kind: 'retry' as const, label: t('failureCtaRetry') }, { kind: 'report' as const, label: t('errorReportButton') }],
    };
  }
  if (action === 'activate-tab') {
    return {
      reason: t('failureReasonManualAction'),
      guidance: t('failureGuidanceActiveTab', platform),
      ctas: [...open, { kind: 'retry' as const, label: t('failureCtaRetry') }, { kind: 'report' as const, label: t('errorReportButton') }],
    };
  }
  if (action === 'check-post-before-retry') {
    return {
      reason: t('failureReasonPostUncertain'),
      guidance: t('failureGuidancePostUncertain', platform),
      ctas: [...open, { kind: 'report' as const, label: t('errorReportButton') }],
    };
  }
  if (action === 'fix-media') {
    return {
      reason: t('failureReasonMediaLimit'),
      guidance: t('failureGuidanceMediaLimit'),
      ctas: [{ kind: 'retry' as const, label: t('failureCtaRetry') }, { kind: 'report' as const, label: t('errorReportButton') }],
    };
  }
  if (action === 'wait') {
    return {
      reason: t('failureReasonDuplicate'),
      guidance: t('failureGuidanceDuplicate'),
      ctas: [{ kind: 'wait' as const, label: t('failureCtaWaitFiveMinutes') }, { kind: 'report' as const, label: t('errorReportButton') }],
    };
  }
  if (action === 'report-ui-change') {
    return {
      reason: t('failureReasonSelector'),
      guidance: t('failureGuidanceSelector'),
      ctas: [{ kind: 'report' as const, label: t('errorReportButton') }, { kind: 'retry' as const, label: t('failureCtaRetry') }],
    };
  }
  return null;
}
