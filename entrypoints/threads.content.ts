import type { ImageAttachment, Message, PostResultMessage } from '../src/messages';
import { THREADS_SELECTORS, threadsAdapter } from '../src/adapters/threads';
import { findClickableByText } from '../src/utils/dom';
import { executePostFlow } from '../src/utils/post-flow';
import { detectAndReportUser } from '../src/utils/user-detect';

function detectThreadsUser(): string | null {
  // 自分のプロフィールリンクは /@username 形式(side nav が最初に来る)
  const links = document.querySelectorAll<HTMLAnchorElement>('a[href^="/@"]');
  for (const link of links) {
    const m = link.getAttribute('href')?.match(/^\/@([^/?#]+)$/);
    if (m && m[1]) return '@' + m[1];
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
