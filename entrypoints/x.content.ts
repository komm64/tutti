import { initLogLevelFromSettings, log } from '../src/utils/logger';
import type { ImageAttachment, Message, PostResultMessage } from '../src/messages';
import { X_SELECTORS, xAdapter } from '../src/adapters/x';
import { executePostFlow } from '../src/utils/post-flow';
import { buildDiagnosis } from '../src/utils/diagnose';
import { resolveSelectors } from '../src/utils/selector-overrides';
import { detectAndReportUser } from '../src/utils/user-detect';

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
  _textChunks?: string[],
): Promise<PostResultMessage> {
  const sel = await resolveSelectors('x', X_SELECTORS);

  // v0.4.66〜 thread chaining 廃止: chunks > 1 は background.ts の generic loop
  // で各 chunk を別 tweet として post する (旧 thread mode は X UI 変更で完全失敗)。
  // ここは常に single chunk として扱う (background が 1 chunk ずつ送る)。

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

