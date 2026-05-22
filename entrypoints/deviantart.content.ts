import { initLogLevelFromSettings, log } from '../src/utils/logger';
import type { ImageAttachment, Message, PostResultMessage } from '../src/messages';
import { DEVIANTART_SELECTORS, buildDeviantArtTitle } from '../src/adapters/deviantart';
import { executeMultiStepFlow, type Step } from '../src/utils/step-runner';
import { injectImages, injectTagList, injectTextIntoElement } from '../src/utils/image';
import { sleep, waitForElement } from '../src/utils/dom';
import { extractHashtags } from '../src/utils/hashtags';
import { waitForPostUrl } from '../src/utils/url-capture';
import { buildDiagnosis } from '../src/utils/diagnose';
import { resolveSelectors } from '../src/utils/selector-overrides';
import { detectAndReportUser } from '../src/utils/user-detect';

/**
 * DeviantArt のログイン中ユーザー検出。
 *
 * 旧コードは `header a[href^="/"]` を含めて走査して、 anchor の data-username
 * もしくは href slug を返していた。 だが DA の header には Submit / Browse /
 * 通知 popover などの link が並び、 さらに body 側にも作者 link が大量にあって
 * **first match が他ユーザーになる** 事故が起きやすい (「全然違う人の名前が
 * 出る」 bug の典型)。
 *
 * 修正方針: own profile を strongly 同定する `a[data-username]` を first、
 * その次に `a[aria-label*="profile" i]`。 header の slug 走査は廃止。
 */
function detectDeviantArtUser(): string | null {
  const RESERVED = new Set(['login', 'logout', 'settings', 'help', 'studio', 'submit', 'home']);

  // 戦略 1: data-username (DA の own profile link 専用 attribute)
  const dataMatch = document.querySelector<HTMLAnchorElement>('a[data-username]');
  const dataUser = dataMatch?.getAttribute('data-username') ?? '';
  if (/^[\w-]{2,}$/.test(dataUser) && !RESERVED.has(dataUser.toLowerCase())) {
    return dataUser;
  }

  // 戦略 2: aria-label*="profile" が指す自分の profile link
  const profileLink = document.querySelector<HTMLAnchorElement>(
    'a[aria-label*="profile" i][href^="/"]',
  );
  const href = profileLink?.getAttribute('href') ?? '';
  const m = href.match(/^\/([^/?#]+)$/);
  if (m && m[1] && /^[\w-]{2,}$/.test(m[1]) && !RESERVED.has(m[1].toLowerCase())) {
    return m[1];
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
    // v0.4.74 で DA の description は **完全 lazy-mount** だと確定 (probe 2026-05-22):
    //   - Description label の sibling に `<div data-editor-viewer="1">` がある
    //   - その中に `<p class="empty-p"><br></p>` (placeholder)
    //   - 実 contenteditable は **click 等のユーザ操作後に mount** される
    //
    // lazy-mount trigger: data-editor-viewer / empty-p を click + focus → 5s 待機。
    // それでも mount しない場合は warn + title だけで続行 (best-effort)。
    {
      name: 'fill-description',
      action: async () => {
        try {
          // Description label を見つける
          const labels = Array.from(document.querySelectorAll<HTMLLabelElement>('label'));
          const descLabel = labels.find((l) => /^Description\b/i.test((l.textContent ?? '').trim()));
          if (descLabel) {
            // lazy-mount trigger: data-editor-viewer / empty-p / parent の click
            const parent = descLabel.parentElement;
            const editorViewer = parent?.querySelector<HTMLElement>('[data-editor-viewer]');
            const emptyP = parent?.querySelector<HTMLElement>('p.empty-p, p[class*="empty"]');
            const triggerEls: HTMLElement[] = [];
            if (editorViewer) triggerEls.push(editorViewer);
            if (emptyP) triggerEls.push(emptyP);
            // label の for-target も念のため
            const forAttr = descLabel.getAttribute('for');
            const forTarget = forAttr ? document.getElementById(forAttr) : null;
            if (forTarget) triggerEls.push(forTarget);
            for (const el of triggerEls) {
              try {
                el.click();
                if (typeof el.focus === 'function') el.focus();
              } catch { /* ignore */ }
            }
          }
        } catch (e) {
          log.warn(`DA: description trigger 試行で例外 (続行): ${e instanceof Error ? e.message : String(e)}`);
        }
        // editor 出現待ち
        const editor = await waitForElement<HTMLElement>(sel.descriptionEditor, 5000);
        if (!editor) {
          log.warn('DA: description editor が見つかりませんでした (title だけで続行)');
          return;
        }
        try {
          await injectTextIntoElement(text, sel.descriptionEditor);
          log.info('DA: description 注入成功');
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          log.warn(`DA: description 注入失敗 (title だけで続行) — ${msg}`);
        }
      },
      settleMs: 500,
    },
    // Step 4: tags chip 入力 (v0.4.72〜)。 本文 #hashtag を抽出して DA tags
    // field に commit。 DA は tags 必須ではないので best-effort で。
    // (DA は tag 上限 30、 各 30 char 程度)
    {
      name: 'fill-tags',
      action: async () => {
        const tags = extractHashtags(text, { maxCount: 30, maxLen: 30 });
        if (tags.length === 0) {
          log.info('DA: 抽出 hashtag なし、 tags step skip');
          return;
        }
        const tagEl = await waitForElement<HTMLInputElement>(sel.tagInput, 5000);
        if (!tagEl) {
          log.warn('DA: tags input が見つからず skip');
          return;
        }
        try {
          await injectTagList(tags, sel.tagInput);
          log.info(`DA: ${tags.length} 個の tag を chip 化`);
        } catch (e) {
          log.warn(`DA: tag commit 失敗: ${e instanceof Error ? e.message : String(e)}`);
        }
      },
      settleMs: 300,
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

  // dryRun でなければ DA が /<user>/art/<title>-<id> へ redirect するのを待つ
  let url: string | undefined;
  if (!dryRun) {
    const captured = await waitForPostUrl([
      /^https:\/\/(?:www\.)?deviantart\.com\/[^/]+\/art\/[^/?#]+/,
    ], 30000);
    if (!captured) {
      throw new Error('DeviantArt: 投稿後 URL に redirect されませんでした');
    }
    url = captured;
  }

  return {
    type: 'POST_RESULT',
    platform: 'deviantart',
    success: true,
    url,
  };
}
