import type { PlatformId } from '../messages';

/**
 * プラットフォームが受け付けるコンテンツの種別。
 * popup で現在のコンテンツ種別と照合して非対応プラットフォームを示すのに使う。
 *   - text       : 文字投稿
 *   - image      : 画像投稿(最大 4-10 枚)
 *   - shortVideo : 短動画(60s 以下が目安)
 *   - longVideo  : 長動画(YouTube 等で必要)
 */
export type ContentKind = 'text' | 'image' | 'shortVideo' | 'longVideo';

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

export interface ImageConstraints {
  /** 1 枚あたりの最大ファイルサイズ(bytes) */
  maxBytesPerImage: number;
  /** 添付可能枚数 */
  maxImages: number;
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
  /** 画像の制約 */
  imageConstraints: ImageConstraints;
  /** 受け付けるコンテンツ種別 */
  kinds: ContentKind[];
  /**
   * 投稿タブを foreground (active=true) で開く必要がある SNS。
   * Pixiv / DeviantArt / Instagram のような多段 wizard + heavy SPA は
   * background tab だとブラウザが requestAnimationFrame / setTimeout を
   * throttle するため、file upload や React state が極端に遅くなる。
   * popup が閉じる tradeoff を許容してでも foreground で動かす必要がある。
   * 通常 (X / Bluesky / Mastodon 等) は false で popup 維持を優先。
   */
  requiresForegroundTab?: boolean;
}
