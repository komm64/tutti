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
      reason: 'ログインが必要かもしれません',
      guidance: `${platform} のページで sign-in 状態を確認してください。 別タブで開いてログイン → Tutti popup を開き直して再送 で復旧します。`,
      ctas: [
        ...(loginUrl ? [{ kind: 'open-sns' as const, label: `${platform} を開く ↗`, url: loginUrl }] : []),
        { kind: 'retry' as const, label: 'もう一度試す' },
      ],
    };
  }

  // ── アカウント不一致 (multi-account 誤爆 guard) ────────────────
  if (/アカウント|account/.test(e) && /想定|expected|mismatch|違い|switch/.test(e)) {
    return {
      reason: 'アカウントが切り替わっていました',
      guidance: `${platform} の tab で元のアカウントに戻すか、 popup を開き直して新しいアカウントを確認してから再送してください。`,
      ctas: [
        ...(loginUrl ? [{ kind: 'open-sns' as const, label: `${platform} を開く ↗`, url: loginUrl }] : []),
        { kind: 'retry' as const, label: 'アカウント確認後、 再送' },
      ],
    };
  }

  // ── captcha / security check (Pixiv 等) ──────────────────────
  if (/captcha|recaptcha|security check|セキュリティチェック|verify you are human/.test(e)) {
    return {
      reason: '画像認証 (captcha) が表示されています',
      guidance: `${platform} の tab で captcha を完了してから 再送してください。 自動突破はできません。`,
      ctas: [
        ...(loginUrl ? [{ kind: 'open-sns' as const, label: `${platform} を開く ↗`, url: loginUrl }] : []),
        { kind: 'retry' as const, label: 'captcha 完了後、 再送' },
      ],
    };
  }

  // ── サイズ / 尺 オーバー ───────────────────────────────────
  if (/too\s*(?:large|big|long)|over.*limit|exceed|オーバー|超えて|maxbytes|maxduration/.test(e)) {
    return {
      reason: 'メディアが SNS の上限を超えています',
      guidance: '画像は Tutti が自動 resize しますが、 動画 / 動画尺は超過すると拒否されます。 Settings の 「動画の自動整形」 を見直すか、 該当 SNS だけ選択を外して再送してください。',
      ctas: [
        { kind: 'retry' as const, label: 'もう一度試す' },
      ],
    };
  }

  // ── タイムアウト / network ────────────────────────────────
  if (/timeout|timed?\s*out|network|読み込みがタイムアウト|応答がありません/.test(e)) {
    return {
      reason: 'タイムアウト or ネットワーク不調',
      guidance: 'SNS 側の応答が遅れています。 数秒待ってから再送してください。 繰り返すなら回線 / SNS の状態を確認。',
      ctas: [
        { kind: 'retry' as const, label: 'もう一度試す' },
      ],
    };
  }

  // ── 重複投稿 / rate-limit (X 等) ───────────────────────────
  if (/duplicate|rate\s*limit|too\s*many\s*requests|429|same\s*tweet/.test(e)) {
    return {
      reason: '重複 or rate-limit の可能性',
      guidance: '同じ本文を最近投稿していませんか? SNS 側で重複検知された可能性。 少し時間を置いて再送するか、 本文を変えてください。',
      ctas: [
        { kind: 'wait' as const, label: '5 分待って再送' },
      ],
    };
  }

  // ── selector が見つからない (UI 変更?) ──────────────────────
  if (/selector|見つかりません|not found|UI が更新された/.test(e)) {
    return {
      reason: 'SNS の UI が変更された可能性',
      guidance: 'Tutti が想定している投稿フォームの構造を見つけられませんでした。 報告すれば Tutti が自動 PR を立てて修正します (auto-triage)。',
      ctas: [
        { kind: 'report' as const, label: 'この問題を報告' },
        { kind: 'retry' as const, label: 'もう一度試す' },
      ],
    };
  }

  // ── 未分類 ────────────────────────────────────────────────
  return {
    reason: '原因不明のエラー',
    guidance: error.slice(0, 200) || '詳細無し',
    ctas: [
      { kind: 'retry' as const, label: 'もう一度試す' },
      { kind: 'report' as const, label: 'この問題を報告' },
    ],
  };
}
