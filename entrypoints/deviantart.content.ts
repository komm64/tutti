import { initLogLevelFromSettings, log } from '../src/utils/logger';
import type { ImageAttachment, Message, PostResultMessage } from '../src/messages';
import { DEVIANTART_SELECTORS, buildDeviantArtTitle } from '../src/adapters/deviantart';
import { executeMultiStepFlow, type Step } from '../src/utils/step-runner';
import { injectImages, injectTextIntoElement } from '../src/utils/image';
import { sleep, waitForElement } from '../src/utils/dom';
import { buildDiagnosis } from '../src/utils/diagnose';
import { resolveSelectors } from '../src/utils/selector-overrides';
import { detectAndReportUser } from '../src/utils/user-detect';

/**
 * DeviantArt のログイン中ユーザー名検出。
 * header の avatar や user menu link から user URL slug を抽出する。
 */
function detectDeviantArtUser(): string | null {
  const RESERVED = new Set(['login', 'logout', 'settings', 'help', 'studio', 'submit', 'home']);
  // user link は href="/<username>" の形が多い
  const links = document.querySelectorAll<HTMLAnchorElement>(
    'header a[href^="/"], a[aria-label*="profile" i], a[data-username]',
  );
  for (const a of links) {
    const dataUser = a.getAttribute('data-username');
    if (dataUser && /^[\w-]{2,}$/.test(dataUser) && !RESERVED.has(dataUser.toLowerCase())) {
      return dataUser;
    }
    const href = a.getAttribute('href') ?? '';
    const m = href.match(/^\/([^/?#]+)$/);
    if (m && m[1] && /^[\w-]{2,}$/.test(m[1]) && !RESERVED.has(m[1].toLowerCase())) {
      return m[1];
    }
  }
  return null;
}

export default defineContentScript({
  matches: ['https://www.deviantart.com/*', 'https://deviantart.com/*'],
  main() {
    browser.runtime.onMessage.addListener((rawMsg, _sender, sendResponse) => {
      const msg = rawMsg as Message;
      if (msg.type === 'DIAGNOSE_PLATFORM' && msg.platform === 'deviantart') {
        sendResponse(buildDiagnosis('deviantart', DEVIANTART_SELECTORS, detectDeviantArtUser));
        return true;
      }
      if (msg.type !== 'POST_TO_PLATFORM' || msg.platform !== 'deviantart') return;

      void runPost(msg.text, msg.images, msg.dryRun)
        .then((result) => sendResponse(result))
        .catch((err: unknown) => {
          const message = err instanceof Error ? err.message : String(err);
          const result: PostResultMessage = {
            type: 'POST_RESULT',
            platform: 'deviantart',
            success: false,
            error: message,
          };
          sendResponse(result);
        });

      return true;
    });

    void detectAndReportUser('deviantart', detectDeviantArtUser);
    void initLogLevelFromSettings();
    log.info('DeviantArt content script ready');
  },
});

async function runPost(
  text: string,
  images?: ImageAttachment[],
  dryRun?: boolean,
): Promise<PostResultMessage> {
  if (!images || images.length === 0) {
    throw new Error('DeviantArt は画像が必須です');
  }
  if (images.length > 1) {
    log.warn(`DA は 1 deviation = 1 image。${images.length} 枚から最初の 1 枚のみ使用`);
  }

  const sel = await resolveSelectors('deviantart', DEVIANTART_SELECTORS);
  const title = buildDeviantArtTitle(text);

  const steps: Step[] = [
    // Step 1: image inject。/studio?new=1 chooser ページの Deviation タイル内
    // hidden input に setter 経由でファイルを入れると、DA の React が反応して
    // upload modal を開く + サーバ upload + metadata form を mount。
    // タイトルが既に見える状態 (再投稿等で modal が既に開いてる) なら skip。
    {
      name: 'inject-image',
      action: async () => {
        const titleAlreadyVisible = document.querySelector(sel.titleInput);
        if (titleAlreadyVisible) {
          log.info('DA: metadata form already visible, skipping image inject');
          return;
        }
        await injectImages([images[0]!], sel.fileInput);
      },
      settleMs: 200,
    },
    // Step 2: title 入力。inject 後の modal mount + upload 完了まで最大 30s 待つ。
    {
      name: 'fill-title',
      action: async () => {
        const titleEl = await waitForElement<HTMLInputElement>(sel.titleInput, 30000);
        if (!titleEl) {
          throw new Error('DA: title input が出現しませんでした(upload 失敗 / DA UI 変更の可能性)');
        }
        await injectTextIntoElement(title, sel.titleInput);
      },
      settleMs: 300,
    },
    // Step 3: description 入力 (TipTap / ProseMirror)。**best-effort**。
    // DA は description 必須でないので、editor が見つからない / 注入に失敗した
    // 場合は warn して続行 (= title だけで投稿)。Surface 実機 2026-05-13:
    // DA Studio UI 更新で description 編集領域が lazy-mount or iframe 化された
    // 疑い。これを必須にすると投稿が完全停止するので緩める。
    {
      name: 'fill-description',
      action: async () => {
        try {
          await injectTextIntoElement(text, sel.descriptionEditor);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          log.warn(`DA: description 入力をスキップ (title だけで続行) — ${msg}`);
        }
      },
      settleMs: 500,
    },
  ];

  await executeMultiStepFlow({
    steps,
    finalize: {
      // Submit は DOM 順で末尾の "Submit" 文字列ボタン (chooser タイルの "Submit" と被るため)
      finder: () => {
        const submits = Array.from(document.querySelectorAll<HTMLButtonElement>('button'))
          .filter((b) => (b.textContent ?? '').trim() === 'Submit');
        return submits.length > 0 ? submits[submits.length - 1]! : null;
      },
      texts: ['Submit', '送信', 'Publish'],
      afterClickDelayMs: 2000,
    },
    dryRun,
  });

  await sleep(500);

  return {
    type: 'POST_RESULT',
    platform: 'deviantart',
    success: true,
  };
}
