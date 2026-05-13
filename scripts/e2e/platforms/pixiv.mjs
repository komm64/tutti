/**
 * Pixiv E2E real-post test (wizard-ish single-page form)
 *
 * Pixiv は image 必須なので scripts/e2e/fixtures/test-image.jpg が居る前提。
 * 無ければ test を skip する (CI で fixture を repo に含めない方針)。
 *
 * 流れ:
 *   1. https://www.pixiv.net/illustration/create に navigate
 *   2. ログイン (title input が居る)
 *   3. POST_TO_PLATFORM with image fixture
 */

import { ensureLoggedIn, loadFixture, sendPostMessage, timestampedText } from '../_lib.mjs';

const URL_GLOB = 'https://*.pixiv.net/*';
const COMPOSE_URL = 'https://www.pixiv.net/illustration/create';
const TITLE_INPUT = 'input[name="title"]';

export async function run({ ctx, debug }) {
  const image = await loadFixture('test-image.jpg', 'image/jpeg');
  if (!image) {
    return { ok: false, error: 'fixture scripts/e2e/fixtures/test-image.jpg が無いので skip' };
  }
  const text = timestampedText('pixiv');

  const page = await ctx.newPage();
  page.on('console', (m) => {
    if (debug || m.type() === 'error') console.log(`[pixiv:browser:${m.type()}]`, m.text());
  });

  await page.goto(COMPOSE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(3000); // heavy SPA、render を待つ

  const auth = await ensureLoggedIn(page, TITLE_INPUT, 'pixiv');
  if (!auth.ok) return auth;

  const sendResult = await sendPostMessage(ctx, {
    urlGlob: URL_GLOB,
    platform: 'pixiv',
    text,
    images: [image],
  });
  if (!sendResult.ok) {
    return { ok: false, error: `POST failed: ${JSON.stringify(sendResult)}` };
  }
  return { ok: true, note: `posted: "${text.slice(0, 30)}..." (cleanup skipped)` };
}
