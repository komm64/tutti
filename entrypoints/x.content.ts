import { log } from '../src/utils/logger';
import type { ImageAttachment, PostResultMessage } from '../src/messages';
import { X_SELECTORS, xAdapter } from '../src/adapters/x';
import { executePostFlow } from '../src/utils/post-flow';
import { resolveSelectors } from '../src/utils/selector-overrides';
import { bootstrapContentScript } from '../src/utils/content-script-bootstrap';
import { sleep } from '../src/utils/dom';

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
  _textChunks?: string[],
): Promise<PostResultMessage> {
  const sel = await resolveSelectors('x', X_SELECTORS);

  // chunks > 1 は background.ts が reply chain として 1 つずつ送る (v0.4.67〜)。
  // chunk i+1 は chunk i への reply (in_reply_to_status_id 指定) として post。
  // 各 post の URL を取得して background に返し、 次 chunk の reply target にする。

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

