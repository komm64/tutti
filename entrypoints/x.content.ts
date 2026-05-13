import { initLogLevelFromSettings, log } from '../src/utils/logger';
import type { ImageAttachment, Message, PostResultMessage } from '../src/messages';
import { X_SELECTORS, xAdapter } from '../src/adapters/x';
import { executePostFlow } from '../src/utils/post-flow';
import { buildDiagnosis } from '../src/utils/diagnose';
import { resolveSelectors } from '../src/utils/selector-overrides';
import { detectAndReportUser } from '../src/utils/user-detect';
import { injectImages, injectTextIntoElement } from '../src/utils/image';
import { sleep, waitForElement, findClickableByText } from '../src/utils/dom';

const X_RESERVED_PATHS = new Set([
  'home', 'explore', 'notifications', 'messages', 'i', 'compose',
  'settings', 'search', 'bookmarks', 'lists', 'communities',
]);

function detectXUser(): string | null {
  // 戦略 1: data-testid 経由(モバイル / 一部レイアウト)
  for (const sel of [
    'a[data-testid="AppTabBar_Profile_Link"]',
    'a[data-testid="DashButton_ProfileIcon_Link"]',
  ]) {
    const link = document.querySelector<HTMLAnchorElement>(sel);
    const m = link?.getAttribute('href')?.match(/^\/([^/?#]+)$/);
    if (m && m[1] && !X_RESERVED_PATHS.has(m[1])) return '@' + m[1];
  }

  // 戦略 2: side nav の Profile リンク(aria-label = "Profile")
  const ariaLink = document.querySelector<HTMLAnchorElement>(
    'a[aria-label="Profile"][href^="/"]',
  );
  const m2 = ariaLink?.getAttribute('href')?.match(/^\/([^/?#]+)$/);
  if (m2 && m2[1] && !X_RESERVED_PATHS.has(m2[1])) return '@' + m2[1];

  // 戦略 3: side nav nav 配下の profile っぽい anchor。
  // primary nav (`[role="navigation"]`) 内の self-link を探す
  const navLinks = document.querySelectorAll<HTMLAnchorElement>(
    'header nav a[role="link"][href^="/"], nav[role="navigation"] a[href^="/"]',
  );
  for (const a of navLinks) {
    const m = a.getAttribute('href')?.match(/^\/([^/?#]+)$/);
    if (m && m[1] && !X_RESERVED_PATHS.has(m[1])) return '@' + m[1];
  }
  return null;
}

export default defineContentScript({
  matches: ['https://x.com/*', 'https://twitter.com/*'],
  main() {
    browser.runtime.onMessage.addListener((rawMsg, _sender, sendResponse) => {
      const msg = rawMsg as Message;
      if (msg.type === 'DIAGNOSE_PLATFORM' && msg.platform === 'x') {
        sendResponse(buildDiagnosis('x', X_SELECTORS, detectXUser));
        return true;
      }
      if (msg.type !== 'POST_TO_PLATFORM' || msg.platform !== 'x') return;

      void runPost(msg.text, msg.images, msg.dryRun, msg.textChunks)
        .then((result) => sendResponse(result))
        .catch((err: unknown) => {
          const message = err instanceof Error ? err.message : String(err);
          const result: PostResultMessage = {
            type: 'POST_RESULT',
            platform: 'x',
            success: false,
            error: message,
          };
          sendResponse(result);
        });

      return true;
    });

    void detectAndReportUser('x', detectXUser);
    void initLogLevelFromSettings();
    log.info('X content script ready');
  },
});

async function runPost(
  text: string,
  images?: ImageAttachment[],
  dryRun?: boolean,
  textChunks?: string[],
): Promise<PostResultMessage> {
  const sel = await resolveSelectors('x', X_SELECTORS);

  // Thread mode: chunks > 1 を 1 compose 内に「+」連結で投稿
  if (textChunks && textChunks.length > 1) {
    await runThreadPost(textChunks, images, dryRun, sel);
    return { type: 'POST_RESULT', platform: 'x', success: true };
  }

  await executePostFlow({
    prefillsViaUrl: xAdapter.prefillsViaUrl,
    textareaSelector: sel.textarea,
    // inline (home) compose の Post を最優先、無ければ modal の Post に fallback
    postButtonSelector: `${sel.postButtonInline}, ${sel.postButton}`,
    postButtonTexts: ['Post', 'Tweet', '投稿する', 'ポスト'],
    fileInputSelector: sel.fileInput,
    text,
    images,
    dryRun,
  });

  return {
    type: 'POST_RESULT',
    platform: 'x',
    success: true,
  };
}

/**
 * X の inline compose を「+」連結 thread で送る (v0.4.56〜)。
 *
 * 流れ:
 *   1. 1 つ目の textarea に chunk[0] を inject + images attach
 *   2. "Add post" / "+" ボタンを click → 新しい textarea が下に mount される
 *   3. その textarea に chunk[1] を inject
 *   4. 繰り返し
 *   5. dry-run なら全 chunk が入った状態で停止 (Post all は押さない)
 *   6. 通常時は "Post all" ボタンを click
 */
async function runThreadPost(
  chunks: string[],
  images: ImageAttachment[] | undefined,
  dryRun: boolean | undefined,
  sel: { textarea: string; postButtonInline: string; postButton: string; fileInput: string },
): Promise<void> {
  // 1 つ目の textarea を確保
  const first = await waitForElement<HTMLElement>(sel.textarea, 10000);
  if (!first) {
    throw new Error('X の textarea が見つかりません (ログイン済みか?)');
  }
  // chunk[0] inject + image attach
  await injectTextIntoElement(chunks[0]!, sel.textarea);
  if (images && images.length > 0) {
    await injectImages(images, sel.fileInput);
  }

  for (let i = 1; i < chunks.length; i++) {
    const addBtn = findAddPostButton();
    if (!addBtn) {
      throw new Error(`X thread: ${i}/${chunks.length} 番目の "Add post" ボタンが見つかりません (X UI が変わった可能性)`);
    }
    addBtn.click();
    // 新しい textarea (= 既存の N 番目とは別) が mount されるまで待つ
    await sleep(400);
    const all = document.querySelectorAll<HTMLElement>(sel.textarea);
    // N+1 番目 (= 最後の textarea) が新規挿入分
    const newTa = all[i];
    if (!newTa) {
      throw new Error(`X thread: ${i + 1} 番目の textarea が出現しません`);
    }
    // 個別の selector を作って inject
    // tweetTextarea_0 / _1 / _2 ... のように data-testid に index が入る
    const testid = newTa.getAttribute('data-testid');
    const selector = testid ? `[data-testid="${testid}"]` : sel.textarea;
    await injectTextIntoElement(chunks[i]!, selector);
  }

  // "Post all" or "Post" button (chunks > 1 だと label が "Post all" / "ポスト" 等になる)
  const postAll = findPostAllButton(sel);
  if (!postAll) {
    throw new Error('X thread: "Post all" ボタンが見つかりませんでした');
  }

  if (dryRun) {
    log.info(`X thread dry-run: ${chunks.length} posts ready, skipping Post all`);
    const orig = postAll.style.outline;
    postAll.style.outline = '3px dashed #f59e0b';
    setTimeout(() => { postAll.style.outline = orig; }, 5000);
    return;
  }

  postAll.click();
  await sleep(2000);
}

/**
 * inline compose の "+" / "Add post" button を探す。
 * X は data-testid を頻繁に変えるので多段戦略。
 */
function findAddPostButton(): HTMLElement | null {
  // 戦略 1: 標準 data-testid (X が安定運用してる場合)
  const byTestId = document.querySelector<HTMLElement>(
    '[data-testid="addButton"], [data-testid="tweetButton_AddPost"], [data-testid="tweet_addButton"]',
  );
  if (byTestId) return byTestId;
  // 戦略 2: aria-label (多言語)
  const ariaLabels = ['Add post', 'Add Tweet', '投稿を追加', 'ポストを追加', 'スレッドに追加'];
  for (const label of ariaLabels) {
    const el = document.querySelector<HTMLElement>(`button[aria-label="${label}"], [role="button"][aria-label="${label}"]`);
    if (el) return el;
  }
  // 戦略 3: text fallback (限定的)
  return findClickableByText(['Add post', 'Add Tweet', '投稿を追加', 'ポストを追加']);
}

/**
 * thread mode 投稿時の "Post all" button を探す。chunks > 1 のとき X は
 * "Post" を "Post all" にラベル変更する (英語) / "ポスト" のままだが
 * 機能上 thread をまとめて投稿。
 */
function findPostAllButton(sel: { postButtonInline: string; postButton: string }): HTMLElement | null {
  // 戦略 1: data-testid (Post button は thread でも同 ID のことが多い)
  for (const part of `${sel.postButtonInline}, ${sel.postButton}`.split(',').map((s) => s.trim())) {
    const el = document.querySelector<HTMLElement>(part);
    if (el && !(el as HTMLButtonElement).disabled) return el;
  }
  // 戦略 2: text fallback ("Post all" / "Post" 完全一致)
  return findClickableByText(['Post all', 'Post', '投稿する', 'ポスト']);
}
