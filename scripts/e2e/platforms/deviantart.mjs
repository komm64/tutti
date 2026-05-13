/**
 * DeviantArt E2E real-post test (wizard 型、image 必須)
 *
 * 流れ:
 *   1. https://www.deviantart.com/studio?new=1 に navigate
 *   2. ログイン確認 ("Deviation" タイル / studio header が出現)
 *   3. POST_TO_PLATFORM with image fixture
 *
 * DA は Experimental ステータス。実投稿確認はこれが初。
 */

import { ensureLoggedIn, loadFixture, sendPostMessage, timestampedText } from '../_lib.mjs';

const URL_GLOB = 'https://*.deviantart.com/*';
const COMPOSE_URL = 'https://www.deviantart.com/studio?new=1';
// chooser ページの "Deviation" タイル button or studio header が居ること
const STUDIO_READY = 'button:has-text("Deviation"), [data-testid="studio-app"], main[role="main"]';

export async function run({ ctx, debug }) {
  const image = await loadFixture('test-image.jpg', 'image/jpeg');
  if (!image) {
    return { ok: false, error: 'fixture scripts/e2e/fixtures/test-image.jpg が無いので skip' };
  }
  const text = timestampedText('deviantart');

  const page = await ctx.newPage();
  page.on('console', (m) => {
    if (debug || m.type() === 'error') console.log(`[da:browser:${m.type()}]`, m.text());
  });

  await page.goto(COMPOSE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(3000);

  const auth = await ensureLoggedIn(page, STUDIO_READY, 'deviantart');
  if (!auth.ok) return auth;

  const sendResult = await sendPostMessage(ctx, {
    urlGlob: URL_GLOB,
    platform: 'deviantart',
    text,
    images: [image],
  });
  if (!sendResult.ok) {
    return { ok: false, error: `POST failed: ${JSON.stringify(sendResult)}` };
  }
  return { ok: true, note: `posted: "${text.slice(0, 30)}..." (cleanup skipped)` };
}
