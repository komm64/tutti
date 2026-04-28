import type { PlatformId } from '../messages';

/**
 * 各 SNS のメタ情報と DOM 操作仕様を抽象化したアダプタ。
 * background は registry から条件に合うアダプタを選び、
 * content script は自身の URL に対応するアダプタを使って DOM 操作する。
 */
export interface PlatformAdapter {
  id: PlatformId;
  name: string;
  /** 文字数上限(超過時は分割対象) */
  charLimit: number;
  /** 投稿ページとして扱う URL パターン(content script の matches と整合させる) */
  matchUrl: (url: string) => boolean;
  /** 投稿用に開くべき URL(新規タブ作成時) */
  composeUrl: string;
}
