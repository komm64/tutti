/**
 * Tumblr E2E real-post test
 *
 * 流れ:
 *   1. https://www.tumblr.com/new/text に navigate (= Gutenberg compose modal)
 *   2. ログイン状態確認 (block-editor が居る)
 *   3. POST_TO_PLATFORM 投げて投稿成功を待つ
 *
 * Cleanup は未実装 (Tumblr の delete は dashboard → tile menu → confirm の多段)
 */

import { ensureLoggedIn, sendPostMessage, timestampedText } from '../_lib.mjs';

const URL_GLOB = 'https://*.tumblr.com/*';
const COMPOSE_URL = 'https://www.tumblr.com/new/text';
const EDITOR = '[data-testid="gutenberg-editor"], .block-editor-rich-text__editable';

export async function run({ ctx, debug }) {
  const text = timestampedText('tumblr');
  const page = await ctx.newPage();
  page.on('console', (m) => {
    if (debug || m.type() === 'error') console.log(`[tumblr:browser:${m.type()}]`, m.text());
  });

  await page.goto(COMPOSE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(2000);

  const auth = await ensureLoggedIn(page, EDITOR, 'tumblr');
  if (!auth.ok) return auth;

  const sendResult = await sendPostMessage(ctx, {
    urlGlob: URL_GLOB,
    platform: 'tumblr',
    text,
  });
  if (!sendResult.ok) {
    return { ok: false, error: `POST failed: ${JSON.stringify(sendResult)}` };
  }
  return { ok: true, note: `posted: "${text.slice(0, 30)}..." (cleanup skipped)` };
}
