/**
 * Threads E2E real-post test
 *
 * 流れ:
 *   1. https://www.threads.com/intent/post に navigate (= compose modal が開く)
 *   2. ログイン状態確認 (compose textarea が居る)
 *   3. POST_TO_PLATFORM 投げて投稿成功を待つ
 *
 * Cleanup は未実装 (Threads UI 経由の delete は menu 多段で fragile)
 */

import { ensureLoggedIn, sendPostMessage, timestampedText } from '../_lib.mjs';

const URL_GLOB = 'https://www.threads.*/*';
const COMPOSE_URL = 'https://www.threads.com/intent/post';
const TEXTAREA = 'div[contenteditable="true"][role="textbox"], div[contenteditable="plaintext-only"]';

export async function run({ ctx, debug }) {
  const text = timestampedText('threads');
  const page = await ctx.newPage();
  page.on('console', (m) => {
    if (debug || m.type() === 'error') console.log(`[threads:browser:${m.type()}]`, m.text());
  });

  await page.goto(COMPOSE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  // intent/post は compose modal が立つので少し待つ
  await page.waitForTimeout(2000);

  const auth = await ensureLoggedIn(page, TEXTAREA, 'threads');
  if (!auth.ok) return auth;

  const sendResult = await sendPostMessage(ctx, {
    urlGlob: URL_GLOB,
    platform: 'threads',
    text,
  });
  if (!sendResult.ok) {
    return { ok: false, error: `POST failed: ${JSON.stringify(sendResult)}` };
  }
  return { ok: true, note: `posted: "${text.slice(0, 30)}..." (cleanup skipped)` };
}
