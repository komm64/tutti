/**
 * Bluesky E2E real-post test (DOM driver 経路)
 *
 * API path は scripts/e2e-api/bluesky.test.ts で別途検証。
 * こちらは拡張の content script が DOM 経由で投稿できるかの smoke。
 */

import { ensureLoggedIn, sendPostMessage, timestampedText } from '../_lib.mjs';

const URL_GLOB = 'https://bsky.app/*';
// ログイン確認: compose dialog の textbox が現れる
const TEXTBOX = '[contenteditable="true"][role="textbox"]';

export async function run({ ctx, debug }) {
  const text = timestampedText('bluesky');
  // Bluesky は prefillsViaUrl: true なので URL に text を載せて初期化。
  // 載せないと post button が disabled (= "投稿できる状態じゃない") で死ぬ
  const composeUrl = `https://bsky.app/intent/compose?text=${encodeURIComponent(text)}`;
  const page = await ctx.newPage();
  page.on('console', (m) => {
    if (debug || m.type() === 'error') console.log(`[bsky:browser:${m.type()}]`, m.text());
  });

  await page.goto(composeUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(2000);

  const auth = await ensureLoggedIn(page, TEXTBOX, 'bluesky');
  if (!auth.ok) return auth;

  const sendResult = await sendPostMessage(ctx, {
    urlGlob: URL_GLOB,
    platform: 'bluesky',
    text,
  });
  if (!sendResult.ok) {
    return { ok: false, error: `POST failed: ${JSON.stringify(sendResult)}` };
  }
  return { ok: true, note: `posted: "${text.slice(0, 30)}..." (cleanup skipped)` };
}
