/**
 * YouTube Studio E2E real-post test (Shorts upload)
 *
 * - test 垢に YouTube チャンネル作成済 が前提 (未作成だと
 *   www.youtube.com に redirect されて "Create channel" CTA に飛ばされる)
 * - scripts/e2e/fixtures/test-video.mp4 が居る前提
 *
 * 流れ:
 *   1. https://studio.youtube.com/ に navigate
 *   2. ログイン (Studio dashboard が読まれる = Upload button が出る)
 *   3. POST_TO_PLATFORM with video fixture
 */

import { ensureLoggedIn, loadFixture, sendPostMessage, timestampedText } from '../_lib.mjs';

const URL_GLOB = 'https://studio.youtube.com/*';
const COMPOSE_URL = 'https://studio.youtube.com/';
// Studio dashboard が読まれた印として "Upload videos" tile / "CREATE" button いずれかを期待
const STUDIO_READY = 'ytcp-button#upload-icon, #upload-button, button[aria-label*="Create"]';

export async function run({ ctx, debug }) {
  const video = await loadFixture('test-video.mp4', 'video/mp4', { durationS: 2 });
  if (!video) {
    return { ok: false, error: 'fixture scripts/e2e/fixtures/test-video.mp4 が無いので skip' };
  }
  const text = timestampedText('youtube');

  const page = await ctx.newPage();
  page.on('console', (m) => {
    if (debug || m.type() === 'error') console.log(`[youtube:browser:${m.type()}]`, m.text());
  });

  await page.goto(COMPOSE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(4000); // Studio は heavy

  // チャンネル未作成だと www.youtube.com / に redirect されてる
  const finalUrl = page.url();
  if (!finalUrl.startsWith('https://studio.youtube.com/')) {
    return { ok: false, error: `Studio dashboard が開けない (redirect to ${finalUrl}) — test 垢にチャンネル未作成?` };
  }

  const auth = await ensureLoggedIn(page, STUDIO_READY, 'youtube');
  if (!auth.ok) return auth;

  const sendResult = await sendPostMessage(ctx, {
    urlGlob: URL_GLOB,
    platform: 'youtube',
    text,
    images: [video],
  });
  if (!sendResult.ok) {
    return { ok: false, error: `POST failed: ${JSON.stringify(sendResult)}` };
  }
  return { ok: true, note: `posted: "${text.slice(0, 30)}..." (cleanup skipped)` };
}
