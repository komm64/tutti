import type { ImageAttachment } from '../messages';

/**
 * 各 SNS API client の共通インターフェース。
 * background が credentials の有無で API path / DOM path を切り替える。
 */
export interface ApiPostInput {
  text: string;
  /**
   * 画像 / 動画 (動画は images[0].type が video/* のときに混在し得る)。
   * 各 SNS の API 側 limit は client 内で reject。
   */
  images?: ImageAttachment[];
}

export interface ApiPostResult {
  success: boolean;
  /** 失敗時のメッセージ (popup error toast に出る) */
  error?: string;
  /** 成功時の post URL (popup の post history 用) */
  postUrl?: string;
}

export interface ApiTestResult {
  ok: boolean;
  /** Test 成功時、ログインしてる handle / username (UI で確認用) */
  identifier?: string;
  error?: string;
}
