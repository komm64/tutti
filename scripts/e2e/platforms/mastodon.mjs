/**
 * Mastodon E2E real-post test (DOM driver 経路)
 *
 * default instance は mastodon.social。別 instance の test 垢を使う場合は
 * adapter の matchUrl と URL_GLOB を環境に合わせて変える必要がある (TODO)。
 */

import { ensureLoggedIn, sendPostMessage, timestampedText } from '../_lib.mjs';

const URL_GLOB = 'https://mastodon.social/*';
const COMPOSE_URL = 'https://mastodon.social/share?text=hello';
// compose textarea (Mastodon Web UI)
const COMPOSE_TEXTAREA = 'textarea.autosuggest-textarea__textarea';

export async function run({ ctx, debug }) {
  const text = timestampedText('mastodon');
  const page = await ctx.newPage();
  page.on('console', (m) => {
    if (debug || m.type() === 'error') console.log(`[mstd:browser:${m.type()}]`, m.text());
  });

  await page.goto(COMPOSE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(2000);

  const auth = await ensureLoggedIn(page, COMPOSE_TEXTAREA, 'mastodon');
  if (!auth.ok) return auth;

  const sendResult = await sendPostMessage(ctx, {
    urlGlob: URL_GLOB,
    platform: 'mastodon',
    text,
  });
  if (!sendResult.ok) {
    return { ok: false, error: `POST failed: ${JSON.stringify(sendResult)}` };
  }
  return { ok: true, note: `posted: "${text.slice(0, 30)}..." (cleanup skipped)` };
}
