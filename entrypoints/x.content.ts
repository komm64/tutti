import { log } from '../src/utils/logger';
import type { ImageAttachment, PostResultMessage } from '../src/messages';
import { X_SELECTORS, xAdapter } from '../src/adapters/x';
import { executePostFlow } from '../src/utils/post-flow';
import { resolveSelectors } from '../src/utils/selector-overrides';
import { bootstrapContentScript } from '../src/utils/content-script-bootstrap';
import { sleep, waitForElement } from '../src/utils/dom';
import { injectImages, injectTextIntoElement } from '../src/utils/image';

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
  const cleanHandle = handle?.startsWith('@') ? handle.slice(1) : handle;
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
      // inline (home) compose の Post を最優先、無ければ modal の Post に fallback
      postButtonSelector: `${sel.postButtonInline}, ${sel.postButton}`,
      postButtonTexts: ['Post', 'Tweet', '投稿する', 'ポスト'],
      fileInputSelector: sel.fileInput,
      text,
      images,
      dryRun,
    });
  }

  // dryRun でなければ post URL を capture (= 本当の完了)。 reply chain の連結
  // 元として background が tweet_id を抽出するために必要。
  let url: string | undefined;
  if (!dryRun) {
    if (!cleanHandle) {
      throw new Error('X: own handle 未検出のため post URL を capture できません');
    }
    const captured = await captureNewXPostUrl(cleanHandle, beforeIds, 30000);
    if (!captured) {
      throw new Error('X: 投稿後の tweet URL を 30s 以内に取得できませんでした (timeline 更新失敗?)');
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
  if (!textarea0) throw new Error('X: 最初の textarea が見つかりません');

  // v0.4.97: 画像 → text の順序が重要。 旧 (text→image) は X の Lexical が
  // image 追加時に compose を re-mount して chunk 0 text を失う事故があった
  // (user 報告: 「画像だけが表示される」)。 画像 attach 後の DOM settle を
  // 待ってから text を inject すれば、 最終状態の textarea に当たって残る。
  // 画像 attach だけでも 「ポストを追加 (+)」 button は有効化される。
  if (images && images.length > 0) {
    await injectImages(images, sel.fileInput);
    await sleep(800);
  }

  // chunk 0 を inject
  await injectTextIntoElement(chunks[0]!, sel.textarea);
  await sleep(500);

  // 各 chunk を「+」 click → wait → inject の繰り返し。
  for (let i = 1; i < chunks.length; i++) {
    const addBtn = findXAddPostButton();
    if (!addBtn) {
      throw new Error(`X: chunk ${i + 1}/${chunks.length} の「ポストを追加 (+)」 button が見つかりません (chunk ${i} の text が反映されてない可能性)`);
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
      throw new Error(`X: chunk ${i + 1}/${chunks.length} の textarea が 5s 以内に出現しませんでした (要 ${i + 1} 個、 実 ${got} 個)`);
    }
    const marker = `tutti-x-chunk-${i}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    target.setAttribute('data-tutti-marker', marker);
    await injectTextIntoElement(chunks[i]!, `[data-tutti-marker="${marker}"]`);
    await sleep(300);
  }

  // 全 inject 完了後、 chunk 0 が空になってないか verify。 X は 「+」 click で
  // 既存 chunk の Lexical state を re-mount して text を flush する場合がある (実機
  // 観察 2026-05-23)。 空なら re-inject。
  const finalTextareas = Array.from(document.querySelectorAll<HTMLElement>('[data-testid^="tweetTextarea_"][contenteditable="true"]'));
  for (let i = 0; i < chunks.length; i++) {
    const target = finalTextareas[i];
    if (!target) continue;
    const currentText = (target.textContent ?? '').trim();
    if (currentText.length < Math.min(5, chunks[i]!.length)) {
      // 空 or 著しく短い → re-inject
      const marker = `tutti-x-rechunk-${i}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      target.setAttribute('data-tutti-marker', marker);
      await injectTextIntoElement(chunks[i]!, `[data-tutti-marker="${marker}"]`);
      await sleep(300);
    }
  }

  // Post button (preview なら highlight だけ、 autoPost なら click)
  const postBtn = findXPostAllButton(sel);
  if (!postBtn) throw new Error('X: 全ポスト送信ボタンが見つかりません');
  if (dryRun) {
    const orig = postBtn.style.outline;
    postBtn.style.outline = '3px dashed #f59e0b';
    setTimeout(() => { postBtn.style.outline = orig; }, 5000);
    return;
  }
  postBtn.click();
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
  for (const part of (sel.postButtonInline + ',' + sel.postButton).split(',').map((s) => s.trim()).filter(Boolean)) {
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

