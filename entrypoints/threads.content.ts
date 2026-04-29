import type { ImageAttachment, Message, PostResultMessage } from '../src/messages';
import { THREADS_SELECTORS, threadsAdapter } from '../src/adapters/threads';
import { findClickableByText } from '../src/utils/dom';
import { executePostFlow } from '../src/utils/post-flow';
import { detectAndReportUser } from '../src/utils/user-detect';

function detectThreadsUser(): string | null {
  // 戦略 1: side nav の Profile リンクを優先(aria-label / role 経由)
  const navLink = document.querySelector<HTMLAnchorElement>(
    'a[aria-label="Profile"][href^="/@"], nav a[href^="/@"]',
  );
  const m1 = navLink?.getAttribute('href')?.match(/^\/@([^/?#]+)$/);
  if (m1 && m1[1]) return '@' + m1[1];

  // 戦略 2: meta タグ(og:url が自分のプロフィール URL を指すページなら)
  const ogUrl = document.querySelector<HTMLMetaElement>('meta[property="og:url"]');
  const m2 = ogUrl?.content.match(/threads\.net\/@([^/?#]+)/);
  if (m2 && m2[1]) return '@' + m2[1];

  // 戦略 3: 全 a[href^="/@"] の中で textContent が空でないもの優先(side nav は label 付き)
  // 投稿内のメンションリンクは textContent が "@xxx" 形式、side nav の label は "Profile" 等
  const allLinks = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href^="/@"]'));
  for (const link of allLinks) {
    const text = link.textContent?.trim() ?? '';
    // メンション (text が "@xxx") は除外、それ以外で /@xxx 形式の href を採用
    if (!text.startsWith('@')) {
      const m = link.getAttribute('href')?.match(/^\/@([^/?#]+)$/);
      if (m && m[1]) return '@' + m[1];
    }
  }
  return null;
}

export default defineContentScript({
  matches: ['https://www.threads.net/*'],
  main() {
    browser.runtime.onMessage.addListener((rawMsg, _sender, sendResponse) => {
      const msg = rawMsg as Message;
      if (msg.type !== 'POST_TO_PLATFORM' || msg.platform !== 'threads') return;

      void runPost(msg.text, msg.images)
        .then((result) => sendResponse(result))
        .catch((err: unknown) => {
          const message = err instanceof Error ? err.message : String(err);
          const result: PostResultMessage = {
            type: 'POST_RESULT',
            platform: 'threads',
            success: false,
            error: message,
          };
          sendResponse(result);
        });

      return true;
    });

    void detectAndReportUser('threads', detectThreadsUser);
    console.log('[Tutti] Threads content script ready');
  },
});

async function runPost(text: string, images?: ImageAttachment[]): Promise<PostResultMessage> {
  await executePostFlow({
    prefillsViaUrl: threadsAdapter.prefillsViaUrl,
    textareaSelector: THREADS_SELECTORS.textarea,
    // Threads の post button は React Native Web で aria-label / data-testid が
    // 不安定。テキスト「投稿」「Post」で探す finder を使う。
    postButtonFinder: findThreadsPostButton,
    fileInputSelector: THREADS_SELECTORS.fileInput,
    text,
    images,
    postButtonTimeoutMs: 12000,
  });

  return {
    type: 'POST_RESULT',
    platform: 'threads',
    success: true,
  };
}

/**
 * Threads の post button を見つける。
 *   1. aria-label "Post"/"投稿" の完全一致
 *   2. テキスト内容 "Post"/"投稿"/"投稿する" の完全一致(複数あれば最後)
 */
function findThreadsPostButton(): HTMLElement | null {
  for (const sel of [
    '[aria-label="Post"]',
    '[aria-label="投稿"]',
    '[aria-label="Post now"]',
  ]) {
    const el = document.querySelector<HTMLElement>(sel);
    if (el) return el;
  }
  return findClickableByText(['Post', '投稿', '投稿する', 'Post now']);
}
