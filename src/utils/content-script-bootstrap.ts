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
  /**
   * 投稿実行関数 (各 SNS で書く)。 sendResponse は bootstrap 側で叩く。
   * textChunks: multi-chunk inline thread mode (v0.4.94〜)。 指定時は X / Bluesky 等が
   * 1 つの compose modal に 全 chunks を 「+」 button で並べて 1 click で thread 投稿する。
   */
  runPost: (
    text: string,
    images: ImageAttachment[] | undefined,
    dryRun: boolean | undefined,
    textChunks: string[] | undefined,
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

    // REFRESH_USER (v0.4.83): popup が開かれたときに各 SNS tab の active user を
    // 即時 再検出して CURRENT_USER を送信。 multi-account 切替後の stale display
    // を防ぐ。 broadcast 形式なので platform フィルタ無し (どの SNS tab も応答する)。
    if (msg.type === 'REFRESH_USER') {
      void (async () => {
        try {
          const username = await Promise.resolve(detectUser());
          // v0.4.98: username が null でも CURRENT_USER を送る (= bg 側で
          // stale 値 を clear する)。 初回ロード時の detectAndReportUser とは
          // 違って、 REFRESH_USER は user が popup を開いたタイミングで「最新の状態」
          // を要求してるので、 検出失敗 = 「もう logged in じゃない / 古い値消す」 と
          // 解釈する方が正しい。
          void browser.runtime.sendMessage({ type: 'CURRENT_USER', platform, username });
        } catch { /* ignore */ }
      })();
      return; // sendResponse 不要 (CURRENT_USER で経由)
    }

    // POST_TO_PLATFORM: 当 SNS 宛のものを runPost で処理
    if (msg.type !== 'POST_TO_PLATFORM' || msg.platform !== platform) return;

    void (async () => {
      try {
        // v0.4.83: multi-account 誤爆 guard。 popup が想定していた user
        // (msg.expectedUser) と post 直前の active user を比較し、 別 account に
        // 切替わってたら abort。 detection が null (= 未検出 / 検出失敗) の場合は
        // false-positive 防止のため check skip し post を続行。
        if (msg.expectedUser) {
          const current = await Promise.resolve(detectUser());
          if (current && current !== msg.expectedUser) {
            log.warn(`${platform}: account mismatch ${msg.expectedUser} → ${current}、 post abort`);
            sendResponse({
              type: 'POST_RESULT',
              platform,
              success: false,
              error: `${platform}: 想定していたアカウント (${msg.expectedUser}) と現在のアカウント (${current}) が違います。 タブで元のアカウントに戻すか、 popup を開き直して新しいアカウントを確認してください。`,
            } satisfies PostResultMessage);
            return;
          }
        }
        const result = await runPost(msg.text, msg.images, msg.dryRun, msg.textChunks);
        sendResponse(result);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        sendResponse({
          type: 'POST_RESULT',
          platform,
          success: false,
          error: message,
        } satisfies PostResultMessage);
      }
    })();
    return true;
  });

  void detectAndReportUser(platform, detectUser);
  void initLogLevelFromSettings();
  log.info(`${platform} content script ready`);
}
