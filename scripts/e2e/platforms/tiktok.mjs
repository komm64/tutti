/**
 * TikTok E2E real-post test (Studio upload)
 *
 * TikTok は video 必須なので scripts/e2e/fixtures/test-video.mp4 が居る前提。
 *
 * 流れ:
 *   1. https://www.tiktok.com/tiktokstudio/upload に navigate
 *   2. ログイン (Select video ボタン / file input が居る)
 *   3. POST_TO_PLATFORM with video fixture
 */

import { ensureLoggedIn, loadFixture, sendPostMessage, timestampedText } from '../_lib.mjs';

const URL_GLOB = 'https://*.tiktok.com/*';
const COMPOSE_URL = 'https://www.tiktok.com/tiktokstudio/upload';
const VIDEO_INPUT = 'input[type="file"][accept*="video"]';

export async function run({ ctx, debug }) {
  const video = await loadFixture('test-video.mp4', 'video/mp4', { durationS: 2 });
  if (!video) {
    return { ok: false, error: 'fixture scripts/e2e/fixtures/test-video.mp4 が無いので skip' };
  }
  const text = timestampedText('tiktok');

  const page = await ctx.newPage();
  page.on('console', (m) => {
    if (debug || m.type() === 'error') console.log(`[tiktok:browser:${m.type()}]`, m.text());
  });

  await page.goto(COMPOSE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(3000);

  const auth = await ensureLoggedIn(page, VIDEO_INPUT, 'tiktok');
  if (!auth.ok) return auth;

  const sendResult = await sendPostMessage(ctx, {
    urlGlob: URL_GLOB,
    platform: 'tiktok',
    text,
    images: [video], // ImageAttachment は video も含む
  });
  if (!sendResult.ok) {
    return { ok: false, error: `POST failed: ${JSON.stringify(sendResult)}` };
  }
  return { ok: true, note: `posted: "${text.slice(0, 30)}..." (cleanup skipped)` };
}
