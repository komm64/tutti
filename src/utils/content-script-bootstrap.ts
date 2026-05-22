/**
 * 11 SNS content script に共通する boilerplate を集約 (v0.4.79〜)。
 *
 * 各 content script は元々:
 *   - chrome.runtime.onMessage で POST_TO_PLATFORM / DIAGNOSE_PLATFORM を捌く
 *   - detectAndReportUser + initLogLevelFromSettings を呼ぶ
 *   - log.info で起動ログを出す
 *
 * という同じ shape を 11 個書いてた。 これを `bootstrapContentScript()` 1 つで
 * 共有して、 SNS 固有部分 (`runPost` / `detectUser` / `SELECTORS`) だけ渡せば
 * 同じ動作になるようにする。
 *
 * 使い方:
 * ```ts
 * import { bootstrapContentScript } from '../src/utils/content-script-bootstrap';
 * export default defineContentScript({
 *   matches: ['https://misskey.io/*'],
 *   main: () => bootstrapContentScript({
 *     platform: 'misskey',
 *     selectors: MISSKEY_SELECTORS,
 *     detectUser: detectMisskeyUser,
 *     runPost,
 *   }),
 * });
 * ```
 *
 * VERIFY_POST_DOM は全 SNS 共通 logic なので verify-helper.content.ts に
 * 集約済 (v0.4.77〜)。 ここでは扱わない。
 */

import type { ImageAttachment, Message, PlatformId, PostResultMessage } from '../messages';
import { initLogLevelFromSettings, log } from './logger';
import { buildDiagnosis } from './diagnose';
import { detectAndReportUser } from './user-detect';

export interface BootstrapOptions<S extends Record<string, string>> {
  /** 'x' / 'bluesky' / etc */
  platform: PlatformId;
  /** 当 SNS の selector map (DIAGNOSE_PLATFORM で返す) */
  selectors: S;
  /** logged-in user 名検出 ('null' で未ログイン扱い)。 detectAndReportUser に渡す */
  detectUser: () => string | null | Promise<string | null>;
  /** 投稿実行関数 (各 SNS で書く)。 sendResponse は bootstrap 側で叩く */
  runPost: (
    text: string,
    images: ImageAttachment[] | undefined,
    dryRun: boolean | undefined,
  ) => Promise<PostResultMessage>;
  /**
   * 当 SNS 固有の追加 message handler (例: bluesky の GET_BLUESKY_SESSION)。
   * `true` を返すと bootstrap 標準の dispatch を skip して async sendResponse 待ち
   * 扱いになる。 `false` / `undefined` を返すと bootstrap が標準処理に進む。
   */
  extraHandler?: (
    msg: Message,
    sendResponse: (response?: unknown) => void,
  ) => boolean | undefined;
}

export function bootstrapContentScript<S extends Record<string, string>>(
  opts: BootstrapOptions<S>,
): void {
  const { platform, selectors, detectUser, runPost, extraHandler } = opts;

  browser.runtime.onMessage.addListener((rawMsg, _sender, sendResponse) => {
    const msg = rawMsg as Message;

    // 当 SNS 固有の追加 handler (bluesky の GET_BLUESKY_SESSION 等)
    if (extraHandler) {
      const handled = extraHandler(msg, sendResponse);
      if (handled) return true;
    }

    // DIAGNOSE_PLATFORM: 当 SNS 宛のものを buildDiagnosis で返す
    if (msg.type === 'DIAGNOSE_PLATFORM' && msg.platform === platform) {
      sendResponse(buildDiagnosis(platform, selectors, detectUser));
      return true;
    }

    // POST_TO_PLATFORM: 当 SNS 宛のものを runPost で処理
    if (msg.type !== 'POST_TO_PLATFORM' || msg.platform !== platform) return;

    void runPost(msg.text, msg.images, msg.dryRun)
      .then((result) => sendResponse(result))
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        const result: PostResultMessage = {
          type: 'POST_RESULT',
          platform,
          success: false,
          error: message,
        };
        sendResponse(result);
      });
    return true;
  });

  void detectAndReportUser(platform, detectUser);
  void initLogLevelFromSettings();
  log.info(`${platform} content script ready`);
}
