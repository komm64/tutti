import type { PlatformId } from '../messages';

/**
 * 各 SNS のメタ情報と投稿フローを抽象化したアダプタ。
 *
 * 投稿フローは大きく 2 種類:
 *   - URL pre-fill 方式(prefillsViaUrl: true) ── intent URL 等で text を URL に乗せて
 *     遷移させると textarea に自動で入る。content script は post button を click するだけ
 *   - DOM injection 方式(prefillsViaUrl: false) ── content script が textarea を見つけて
 *     execCommand でテキストを注入し、post button を click する
 *
 * URL 方式の方が UI 変更に強くロバストなので、対応している SNS では優先する。
 */
export interface VideoConstraints {
  /** 最大尺(秒)。0 = 制限なし */
  maxDurationS: number;
  /** 最大ファイルサイズ(bytes)。0 = 制限なし */
  maxBytes: number;
}

export interface PlatformAdapter {
  id: PlatformId;
  name: string;
  /** 文字数上限(超過時は分割対象) */
  charLimit: number;
  /** 投稿ページとして扱う URL パターン(content script の matches と整合させる) */
  matchUrl: (url: string) => boolean;
  /** 投稿用に開くべき URL を返す。URL pre-fill する SNS では text を URL に乗せる */
  getComposeUrl: (text: string) => string;
  /** true なら URL 遷移だけで textarea に text が入る、false なら content script で注入する */
  prefillsViaUrl: boolean;
  /** 動画の制約。undefined = 動画不可 */
  videoConstraints?: VideoConstraints;
}
