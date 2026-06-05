import { log } from '../src/utils/logger';
import type { ImageAttachment, PostResultMessage } from '../src/messages';
import { X_SELECTORS, xAdapter } from '../src/adapters/x';
import { executePostFlow } from '../src/utils/post-flow';
import { resolveSelectors } from '../src/utils/selector-overrides';
import { bootstrapContentScript } from '../src/utils/content-script-bootstrap';
import { sleep, waitForElement } from '../src/utils/dom';
import {
  clickElementInMainWorld,
  getLatestXPostUrlInMainWorld,
  injectImages,
  injectTextIntoElement,
} from '../src/utils/image';
import { t } from '../src/utils/i18n';
import { markPostSubmissionStarted } from '../src/utils/post-submission-state';

const X_RESERVED_PATHS = new Set([
  'home', 'explore', 'notifications', 'messages', 'i', 'compose',
  'settings', 'search', 'bookmarks', 'lists', 'communities',
]);

function detectXUser(): string | null {
  // 戦略 0: compact side nav では profile link が省略されるが、account menu の
  // avatar test id に handle が残る。
  const accountAvatar = document.querySelector<HTMLElement>(
    '[data-testid="SideNav_AccountSwitcher_Button"] [data-testid^="UserAvatar-Container-"]',
  );
  const avatarHandle = accountAvatar?.getAttribute('data-testid')?.match(/^UserAvatar-Container-(.+)$/)?.[1];
  if (avatarHandle) return '@' + avatarHandle;

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
  main: () => bootstrapContentScript({
    platform: 'x',
    selectors: X_SELECTORS,
    detectUser: detectXUser,
    runPost,
  }),
});

async function runPost(
  text: string,
  images?: ImageAttachment[],
  dryRun?: boolean,
  textChunks?: string[],
): Promise<PostResultMessage> {
  const sel = await resolveSelectors('x', X_SELECTORS);

  // post 前に own user の既存 status link を記録 (post 後の new status を識別する用)
  const handle = detectXUser();
  let cleanHandle = handle?.startsWith('@') ? handle.slice(1) : handle;
  const beforeIds = new Set<string>();
  if (cleanHandle) {
    for (const link of document.querySelectorAll<HTMLAnchorElement>(`a[href*="/${cleanHandle}/status/"]`)) {
      const m = link.getAttribute('href')?.match(new RegExp(`/${cleanHandle}/status/(\\d+)`));
      if (m && m[1]) beforeIds.add(m[1]);
    }
  }

  // v0.4.94: textChunks > 1 のとき X の inline thread compose UI ("+" Add post
  // button) を使って 1 つの compose に全 chunks を並べる。
  // preview mode は post button を click せずに highlight、 user が確認後に押す。
  if (textChunks && textChunks.length > 1) {
    await executeXInlineThread(sel, textChunks, images, dryRun);
  } else {
    await executePostFlow({
      prefillsViaUrl: xAdapter.prefillsViaUrl,
      textareaSelector: sel.textarea,
      // reply intent の modal と home compose が同時に存在する場合がある。
      // modal を先に選ばないと、home 側の disabled button で待ち続ける。
      postButtonSelector: `${sel.postButton}, ${sel.postButtonInline}`,
      postButtonTexts: ['Post', 'Tweet', 'Reply', '投稿する', 'ポスト', '返信'],
      fileInputSelector: sel.fileInput,
      text: images && images.length > 0 ? '' : text,
      images,
      dryRun,
      composeInputTimeoutMs: 90_000,
      // X は画像添付時に Lexical editor を再生成し、先に注入した本文を失う
      // ことがある。画像 upload 後に本文を再注入してから submit する。
      beforeSubmit: text && images && images.length > 0
        ? () => injectTextWithRetry(text, sel.textarea, text)
        : undefined,
      clickPostButton: () => clickElementInMainWorld(`${sel.postButton}, ${sel.postButtonInline}`, [
        'Post',
        'Tweet',
        'Reply',
        '投稿する',
        'ポスト',
        '返信',
      ]),
    });
  }

  // dryRun でなければ post URL を capture (= 本当の完了)。 reply chain の連結
  // 元として background が tweet_id を抽出するために必要。
  let url: string | undefined;
  if (!dryRun) {
    const detectedAfterSubmit = detectXUser();
    cleanHandle ??= detectedAfterSubmit?.startsWith('@') ? detectedAfterSubmit.slice(1) : detectedAfterSubmit;
    if (!cleanHandle) {
      throw new Error(t('runtimeXOwnHandleMissing'));
    }
    const captured = await captureNewXPostUrl(cleanHandle, beforeIds, 60000);
    if (!captured) {
      throw new Error(t('runtimeXPostUrlTimeout'));
    }
    url = captured;
  }

  return {
    type: 'POST_RESULT',
    platform: 'x',
    success: true,
    url,
  };
}

/**
 * post 後の new tweet URL を timeline / compose 領域から拾う。
 *
 * 戦略: own handle の `/status/<id>` を含む anchor を全 page で scan し、
 * beforeIds に無い ID = 新規 post → URL 化。 30s 上限。
 *
 * X home inline compose で post 後、 X は SPA で home feed の上部に new tweet を
 * 挿入する。 そこから URL が拾える。 modal compose (reply) の場合は modal が
 * 閉じて元 thread page or home に戻り、 そこに new reply tweet が表示される。
 */
/**
 * v0.4.94: X の inline thread compose UI を組み立てる。
 *
 * UI flow:
 *   1. textarea_0 に chunk 0 を inject (画像も最初に attach)
 *   2. "Add post" ボタン (X の "+" / 「ポストを追加」) を click → textarea_1 出現
 *   3. chunk 1 を textarea_1 へ inject。 繰り返し
 *   4. 全 chunks 完了後、 Post button を click (preview なら highlight 止め)
 *
 * X の thread compose ボタンは aria-label が言語依存 ("Add post" / "ポストを追加" 等)、
 * data-testid="addButton" も存在する case あり。 多段 fallback で拾う。
 */
async function executeXInlineThread(
  sel: typeof X_SELECTORS,
  chunks: string[],
  images: ImageAttachment[] | undefined,
  dryRun: boolean | undefined,
): Promise<void> {
  // 最初の textarea が visible になるまで wait (compose UI のロード待ち)
  const textarea0 = await waitForElement<HTMLElement>(sel.textarea, 8000);
  if (!textarea0) throw new Error(t('runtimeXFirstTextareaMissing'));

  // v0.4.97: 画像 → text の順序が重要。 旧 (text→image) は X の Lexical が
  // image 追加時に compose を re-mount して chunk 0 text を失う事故があった。
  // v0.4.100: image upload 完了後の thumbnail render に時間がかかる real X だと
  // 800ms wait では足りず、 後発の Lexical re-mount で chunk 0 が flush されて
  // 「画像だけ表示」 になっていた (user 報告 2026-05-23)。 wait を 2500ms に
  // 拡張 + injectTextWithRetry で多段 verify+re-inject。
  if (images && images.length > 0) {
    await injectImages(images, sel.fileInput);
    await sleep(2500);
  }

  // chunk 0 を retry 付きで inject
  await injectTextWithRetry(chunks[0]!, sel.textarea, chunks[0]!);

  // 各 chunk を「+」 click → wait → inject の繰り返し。
  for (let i = 1; i < chunks.length; i++) {
    const addBtn = findXAddPostButton();
    if (!addBtn) {
      throw new Error(t('runtimeXAddButtonMissing', i + 1, chunks.length, i));
    }
    addBtn.click();

    // 新 textarea (index i) が出現するまで polling
    let target: HTMLElement | undefined;
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      const tas = Array.from(document.querySelectorAll<HTMLElement>('[data-testid^="tweetTextarea_"][contenteditable="true"]'));
      if (tas.length > i) {
        target = tas[i];
        break;
      }
      await sleep(150);
    }
    if (!target) {
      const got = document.querySelectorAll('[data-testid^="tweetTextarea_"][contenteditable="true"]').length;
      throw new Error(t('runtimeXTextareaTimeout', i + 1, chunks.length, i + 1, got));
    }
    const marker = `tutti-x-chunk-${i}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    target.setAttribute('data-tutti-marker', marker);
    await injectTextWithRetry(chunks[i]!, `[data-tutti-marker="${marker}"]`, chunks[i]!);
  }

  // 全 inject 完了後の最終 verify (上記 retry でも残った orphan を救う)。
  // 各 chunk が textarea[i].textContent と prefix 一致するか確認、 ダメなら 1 回 retry。
  const finalTextareas = Array.from(document.querySelectorAll<HTMLElement>('[data-testid^="tweetTextarea_"][contenteditable="true"]'));
  for (let i = 0; i < chunks.length; i++) {
    const target = finalTextareas[i];
    if (!target) continue;
    const currentText = (target.textContent ?? '').trim();
    const expected = chunks[i]!.trim();
    // text 内容比較: prefix 一致 + 全長 60% 以上 を OK 判定
    const prefixOk = currentText.length > 0 && expected.startsWith(currentText.slice(0, Math.min(20, currentText.length)));
    const lenOk = currentText.length >= Math.min(20, expected.length * 0.6);
    if (!prefixOk || !lenOk) {
      const marker = `tutti-x-rechunk-${i}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      target.setAttribute('data-tutti-marker', marker);
      log.warn(`X: chunk ${i + 1} final verify failed (got "${currentText.slice(0, 30)}"), re-injecting`);
      await injectTextIntoElement(chunks[i]!, `[data-tutti-marker="${marker}"]`);
      await sleep(400);
    }
  }

  // Post button (preview なら highlight だけ、 autoPost なら click)
  const postBtn = findXPostAllButton(sel);
  if (!postBtn) throw new Error(t('runtimeXPostAllButtonMissing'));
  if (dryRun) {
    const orig = postBtn.style.outline;
    postBtn.style.outline = '3px dashed #f59e0b';
    setTimeout(() => { postBtn.style.outline = orig; }, 5000);
    return;
  }
  markPostSubmissionStarted();
  postBtn.click();
}

/**
 * X の Lexical editor に text を inject して、 反映されたか verify、 ダメなら retry。
 *
 * v0.4.100: real X は image upload 完了後にも Lexical state を re-mount することが
 * あり、 inject 直後の text が flush される (= 「画像だけ表示」 bug)。
 * 多段 retry (最大 3 回、 各 attempt 後に 500-800ms の verify wait) で堅牢化。
 */
async function injectTextWithRetry(
  text: string,
  selector: string,
  expectedSnippet: string,
  maxAttempts = 3,
): Promise<void> {
  const expectedPrefix = expectedSnippet.slice(0, 20).trim();
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    await injectTextIntoElement(text, selector);
    await sleep(500 + attempt * 200); // 700 / 900 / 1100ms verify wait
    const el = document.querySelector(selector);
    const got = (el?.textContent ?? '').trim();
    // prefix 一致 + 一定長 で OK 判定
    if (got.length > 0 && got.startsWith(expectedPrefix.slice(0, Math.min(10, expectedPrefix.length)))) {
      if (attempt > 1) log.info(`X: text inject attempt ${attempt}/${maxAttempts} 成功 ("${got.slice(0, 20)}")`);
      return;
    }
    if (attempt < maxAttempts) {
      log.warn(`X: text inject attempt ${attempt}/${maxAttempts} 失敗 (got "${got.slice(0, 30)}", expected prefix "${expectedPrefix.slice(0, 20)}"), retry`);
    }
  }
  throw new Error(t('runtimeTextInjectFailed'));
}

/** X の 「ポストを追加 (+)」 button 候補を多段 fallback で探す。 */
function findXAddPostButton(): HTMLElement | null {
  // data-testid="addButton" を最優先
  const byTestId = document.querySelector<HTMLElement>('[data-testid="addButton"]');
  if (byTestId && !(byTestId as HTMLButtonElement).disabled) return byTestId;
  // aria-label 系
  const ariaPatterns = [/add post/i, /ポストを追加/, /add tweet/i, /ツイートを追加/];
  for (const el of document.querySelectorAll<HTMLElement>('button, [role="button"]')) {
    const aria = el.getAttribute('aria-label') ?? '';
    if (ariaPatterns.some((p) => p.test(aria))) return el;
  }
  return null;
}

/** X の inline thread 全送信 button (= 全 chunks を 1 click で thread 投稿)。 */
function findXPostAllButton(sel: typeof X_SELECTORS): HTMLElement | null {
  // inline thread の Post button は 「Post all」 / 「すべてポスト」 等の text を持つ
  // ことがある (X UI バージョン依存)。 通常の Post button selector も fallback で
  // 扱う。thread compose では modal 側 tweetButton を先に選ぶ。ホーム画面側の
  // tweetButtonInline を先に押すと、追加 chunk だけが投稿される。
  for (const part of (sel.postButton + ',' + sel.postButtonInline).split(',').map((s) => s.trim()).filter(Boolean)) {
    const el = document.querySelector<HTMLElement>(part);
    if (el && !(el as HTMLButtonElement).disabled) return el;
  }
  // text fallback
  for (const el of document.querySelectorAll<HTMLElement>('button, [role="button"]')) {
    const text = (el.textContent ?? '').trim();
    if (/^Post( all)?$|^すべてポスト$|^投稿$|^Tweet( all)?$/.test(text) && !(el as HTMLButtonElement).disabled) {
      return el;
    }
  }
  return null;
}

async function captureNewXPostUrl(
  handle: string,
  before: Set<string>,
  timeoutMs: number,
): Promise<string | null> {
  const deadline = Date.now() + timeoutMs;
  const re = new RegExp(`/${handle}/status/(\\d+)`);
  while (Date.now() < deadline) {
    const captured = await getLatestXPostUrlInMainWorld(handle);
    if (captured) return captured;
    const links = Array.from(document.querySelectorAll<HTMLAnchorElement>(`a[href*="/${handle}/status/"]`));
    for (const link of links) {
      const m = link.getAttribute('href')?.match(re);
      if (m && m[1] && !before.has(m[1])) {
        return `https://x.com/${handle}/status/${m[1]}`;
      }
    }
    await sleep(500);
  }
  return null;
}
