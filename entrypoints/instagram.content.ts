import { initLogLevelFromSettings, log } from '../src/utils/logger';
import type { ImageAttachment, Message, PostResultMessage } from '../src/messages';
import { INSTAGRAM_SELECTORS } from '../src/adapters/instagram';
import { executeMultiStepFlow, type Step } from '../src/utils/step-runner';
import { injectImages, injectTextIntoElement } from '../src/utils/image';
import { sleep, waitForElement } from '../src/utils/dom';
import { buildDiagnosis } from '../src/utils/diagnose';
import { resolveSelectors } from '../src/utils/selector-overrides';
import { detectAndReportUser } from '../src/utils/user-detect';

/**
 * Instagram のログイン中ユーザー名検出。Profile sidebar link の slug が一番堅い。
 */
function detectInstagramUser(): string | null {
  const RESERVED = new Set([
    'home', 'explore', 'reels', 'direct', 'inbox', 'p', 'reel', 'stories',
    'accounts', 'notifications', 'create', 'settings', 'shop', 'bookmarks',
  ]);

  const isLikely = (s: string | undefined | null): s is string =>
    !!s && /^[\w._]{2,30}$/.test(s) && !RESERVED.has(s.toLowerCase());

  // 戦略 1: side nav の Profile link (href="/<username>/")
  const profileLink = document.querySelector<HTMLAnchorElement>(
    'a[href$="/"][role="link"][tabindex="0"]',
  );
  const m1 = profileLink?.getAttribute('href')?.match(/^\/([^/?#]+)\/$/);
  if (isLikely(m1?.[1])) return m1![1]!;

  // 戦略 2: 任意の anchor 内 self-link (header の avatar 等)
  for (const a of document.querySelectorAll<HTMLAnchorElement>('a[href^="/"]')) {
    const m = a.getAttribute('href')?.match(/^\/([^/?#]+)\/$/);
    if (isLikely(m?.[1])) return m![1]!;
  }
  return null;
}

export default defineContentScript({
  matches: ['https://www.instagram.com/*', 'https://instagram.com/*'],
  main() {
    browser.runtime.onMessage.addListener((rawMsg, _sender, sendResponse) => {
      const msg = rawMsg as Message;
      if (msg.type === 'DIAGNOSE_PLATFORM' && msg.platform === 'instagram') {
        sendResponse(buildDiagnosis('instagram', INSTAGRAM_SELECTORS, detectInstagramUser));
        return true;
      }
      if (msg.type !== 'POST_TO_PLATFORM' || msg.platform !== 'instagram') return;

      void runPost(msg.text, msg.images, msg.dryRun)
        .then((result) => sendResponse(result))
        .catch((err: unknown) => {
          const message = err instanceof Error ? err.message : String(err);
          const result: PostResultMessage = {
            type: 'POST_RESULT',
            platform: 'instagram',
            success: false,
            error: message,
          };
          sendResponse(result);
        });

      return true;
    });

    void detectAndReportUser('instagram', detectInstagramUser);
    void initLogLevelFromSettings();
    log.info('Instagram content script ready');
  },
});

async function runPost(
  text: string,
  images?: ImageAttachment[],
  dryRun?: boolean,
): Promise<PostResultMessage> {
  if (!images || images.length === 0) {
    throw new Error('Instagram は画像 / 動画が必須です(text のみ投稿は不可)');
  }

  const sel = await resolveSelectors('instagram', INSTAGRAM_SELECTORS);

  // Wizard 構造 (2026-05-01 検証):
  //   1. Create button click → Modal #1 (file 選択)
  //   2. file inject → Modal #2 "Crop" (Next で進む)
  //   3. Next click → Modal #3 "Edit" (Next で進む)
  //   4. Next click → Modal #4 caption + Share
  //   5. caption 入力 → finalize で "Share" click
  const steps: Step[] = [
    // Step 1: Create button click + file 選択 modal が開くまで待つ
    {
      name: 'open-create-modal',
      action: async () => {
        // 既に dialog 内に file input があれば skip (再投稿等)
        const existingFi = document.querySelector(sel.fileInput);
        if (existingFi) {
          log.info('IG: create modal already open, skipping Create click');
          return;
        }
        // Create トリガー: aria-label "New post" or text 中に "Create" / "New post"
        const all = Array.from(document.querySelectorAll<HTMLElement>(
          'a, button, [role="link"], [role="button"]',
        ));
        const target = all.find((b) => {
          const haystack = (b.getAttribute('aria-label') ?? '') + ' ' + ((b.textContent ?? '').trim());
          return /new post|create/i.test(haystack);
        });
        if (!target) {
          throw new Error('IG: "Create" / "New post" ボタンが見つかりません');
        }
        target.click();
      },
      // file input が dialog に mount されるまで少し待つ
      settleMs: 1500,
    },
    // Step 2: image inject。Modal #2 (Crop) に自動遷移する
    {
      name: 'inject-image',
      action: async () => {
        // file input が出るまで待ち
        const fi = await waitForElement<HTMLInputElement>(sel.fileInput, 8000);
        if (!fi) {
          throw new Error('IG: file input が dialog 内に出現しませんでした');
        }
        await injectImages(images, sel.fileInput);
      },
      settleMs: 200,
      // Crop 画面の Next ボタン click で進む
      advance: {
        finder: () => findDialogButtonByText(['Next', '次へ']),
        timeoutMs: 15000, // upload + crop 画面 mount に時間かかる
      },
      // Edit (filter) 画面の Next ボタンが出るまで待つ
      awaitNextDom: { selector: '[role="dialog"]', timeoutMs: 8000 },
    },
    // Step 3: Edit (filter) 画面で Next click → caption 画面へ
    {
      name: 'skip-filter',
      action: async () => {
        // 何もしない (filter は default のまま)
      },
      settleMs: 500,
      advance: {
        finder: () => findDialogButtonByText(['Next', '次へ']),
        timeoutMs: 8000,
      },
      // caption editor が出るまで待つ
      awaitNextDom: { selector: sel.captionEditor, timeoutMs: 10000 },
    },
    // Step 4: caption 入力 → finalize=Share
    {
      name: 'fill-caption',
      action: async () => {
        await injectTextIntoElement(text, sel.captionEditor);
      },
      settleMs: 500,
    },
  ];

  await executeMultiStepFlow({
    steps,
    finalize: {
      // Share ボタン (dialog 内、最後の wizard 画面のみ)
      finder: () => findDialogButtonByText(['Share', '共有', 'Post']),
      afterClickDelayMs: 3000,
    },
    dryRun,
  });

  // dry-run は finalize click をスキップしてるので verify も skip
  if (!dryRun) {
    await verifyInstagramPosted();
  }

  return {
    type: 'POST_RESULT',
    platform: 'instagram',
    success: true,
  };
}

/**
 * Share click 後に **実際に投稿が成立したか** を verify する。
 *
 * これが無いと「Share button を click した」だけで `success: true` を返してしまい、
 * - IG 側で error toast が出ていた / dialog 内エラーで止まっていた
 * - wizard が想定外に追加された (Audience step 等) で Share 押下に至っていなかった
 * といった silent failure を user が「Tutti は成功と言ったが投稿が無い」と
 * 経験することになる (2026-05-13 ユーザ報告)。
 *
 * 検証方針: Share click 後の dialog が消える / または "shared" 系の成功 UI に
 * 切り替わるのを最大 30s 待つ。timeout / 内部に error text を発見した場合は throw。
 */
async function verifyInstagramPosted(timeoutMs = 30_000): Promise<void> {
  const ERROR_TEXT_RE = /error|failed|try again|too large|please try|エラー|失敗|もう一度/i;
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
    if (!dialog) {
      // dialog 消失 = post 確定。返却 OK
      log.info('IG: post verified (dialog closed)');
      return;
    }
    // dialog はまだあるが、success 状態 ("Your post has been shared" 等) に
    // 切り替わっていれば OK
    const txt = (dialog.textContent ?? '').slice(0, 500);
    if (/shared|共有しました|posted/i.test(txt)) {
      log.info('IG: post verified (success message visible)');
      return;
    }
    // エラー表示が出ている場合は即時 throw
    if (ERROR_TEXT_RE.test(txt)) {
      throw new Error(
        `IG: Share 後の dialog にエラー表示が出ました — ${txt.slice(0, 200)}`,
      );
    }
    await sleep(500);
  }
  throw new Error(
    `IG: Share click 後 ${timeoutMs / 1000}s 経っても dialog が閉じませんでした(投稿が完了してない可能性、UI が変わった疑い)`,
  );
}

/**
 * dialog 内で text が完全一致 (trim 後) する button / [role="button"] を探す。
 * dialog 外の "Next" 等(別 UI 要素)を誤って拾わないため scope を限定。
 * 同じテキストが複数あれば最後のものを返す (大抵は最下部の primary action)。
 */
function findDialogButtonByText(texts: string[]): HTMLElement | null {
  const dialogs = document.querySelectorAll<HTMLElement>('[role="dialog"]');
  let lastMatch: HTMLElement | null = null;
  for (const dialog of dialogs) {
    const buttons = dialog.querySelectorAll<HTMLElement>('button, [role="button"]');
    for (const b of buttons) {
      const t = (b.textContent ?? '').trim();
      if (texts.includes(t)) lastMatch = b;
    }
  }
  return lastMatch;
}
