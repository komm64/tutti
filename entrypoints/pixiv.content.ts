import { initLogLevelFromSettings, log } from '../src/utils/logger';
import type { ImageAttachment, Message, PostResultMessage } from '../src/messages';
import { PIXIV_SELECTORS, buildPixivTitle, pixivAdapter } from '../src/adapters/pixiv';
import { executeMultiStepFlow, type Step } from '../src/utils/step-runner';
import { injectImages, injectTextIntoElement } from '../src/utils/image';
import { sleep } from '../src/utils/dom';
import { buildDiagnosis } from '../src/utils/diagnose';
import { resolveSelectors } from '../src/utils/selector-overrides';
import { detectAndReportUser } from '../src/utils/user-detect';

/**
 * Pixiv の logged-in user を header の自分の作品リンクから検出する。
 * `a[href^="/users/<id>"]` のうち最初に現れるものは大抵 self-link。
 * URL 内の数値 user id ではなく display 名を取りたいので、その後の avatar/name 要素から拾う。
 */
function detectPixivUser(): string | null {
  // header / nav の Profile / Account 系メニュー。Pixiv は user id 番号 + display name の構造
  const RESERVED = new Set(['login', 'logout', 'settings', 'help']);
  const nameEls = document.querySelectorAll<HTMLElement>(
    'a[href^="/users/"] [aria-label], a[href^="/users/"] img[alt]',
  );
  for (const el of nameEls) {
    const candidate =
      (el.getAttribute('aria-label') ?? el.getAttribute('alt') ?? '').trim();
    if (candidate && candidate.length >= 1 && !RESERVED.has(candidate.toLowerCase())) {
      return candidate;
    }
  }
  // fallback: header の dropdown trigger に付く screen name
  const accountBtn = document.querySelector<HTMLElement>(
    '[aria-label*="account" i], [data-gtm-label*="account" i]',
  );
  if (accountBtn) {
    const txt = accountBtn.textContent?.trim();
    if (txt && txt.length >= 1) return txt.slice(0, 30);
  }
  return null;
}

export default defineContentScript({
  matches: ['https://www.pixiv.net/*', 'https://pixiv.net/*'],
  main() {
    browser.runtime.onMessage.addListener((rawMsg, _sender, sendResponse) => {
      const msg = rawMsg as Message;
      if (msg.type === 'DIAGNOSE_PLATFORM' && msg.platform === 'pixiv') {
        sendResponse(buildDiagnosis('pixiv', PIXIV_SELECTORS, detectPixivUser));
        return true;
      }
      if (msg.type !== 'POST_TO_PLATFORM' || msg.platform !== 'pixiv') return;

      void runPost(msg.text, msg.images, msg.dryRun)
        .then((result) => sendResponse(result))
        .catch((err: unknown) => {
          const message = err instanceof Error ? err.message : String(err);
          const result: PostResultMessage = {
            type: 'POST_RESULT',
            platform: 'pixiv',
            success: false,
            error: message,
          };
          sendResponse(result);
        });

      return true;
    });

    void detectAndReportUser('pixiv', detectPixivUser);
    void initLogLevelFromSettings();
    log.info('Pixiv content script ready');
  },
});

async function runPost(
  text: string,
  images?: ImageAttachment[],
  dryRun?: boolean,
): Promise<PostResultMessage> {
  if (!images || images.length === 0) {
    throw new Error('Pixiv は画像が必須です(本文のみ投稿は不可)');
  }

  const sel = await resolveSelectors('pixiv', PIXIV_SELECTORS);
  const title = buildPixivTitle(text);

  // Pixiv は単一ページ form なので advance なしの sequential step で表現する。
  // 1) 画像注入 → サムネイル描画待ち / 2) title 入力 / 3) caption 入力 → finalize で Post
  const steps: Step[] = [
    {
      name: 'inject-images',
      action: async () => {
        await injectImages(images, sel.fileInput);
      },
      // サムネイル描画 + 内部 React state 反映を待つ。Pixiv のサーバ upload は
      // injectImages 内の MAIN-world helper で完了確認済 (PerformanceObserver)。
      settleMs: 1500,
    },
    {
      name: 'fill-title',
      action: async () => {
        await injectTextIntoElement(title, sel.titleInput);
      },
      settleMs: 200,
    },
    {
      name: 'fill-caption',
      action: async () => {
        // text 全文を caption に入れる(Pixiv は事実上文字数無制限)
        await injectTextIntoElement(text, sel.captionTextarea);
      },
      settleMs: 200,
    },
  ];

  await executeMultiStepFlow({
    steps,
    finalize: {
      // header Post (`.gtm-work-post-button-in-header-click`) は常時 enabled
      // だが、画像 + title が無ければサーバ側で弾かれる。先に enable される
      // bottom Post を優先 → 無ければ header Post に fallback。
      selector: sel.postButton,
      texts: ['Post', '投稿', 'Submit'],
      afterClickDelayMs: 2000,
    },
    dryRun,
  });

  // dry-run 時に念のため compose ページの state を 0.5s 安定させる
  await sleep(500);

  return {
    type: 'POST_RESULT',
    platform: 'pixiv',
    success: true,
  };
}
