/**
 * Instagram E2E real-post test (4-step wizard)
 *
 * IG は image 必須なので scripts/e2e/fixtures/test-image.jpg が居る前提。
 * 流れ:
 *   1. https://www.instagram.com/ に navigate
 *   2. ログイン確認 (Create / 新規投稿 link が居る)
 *   3. POST_TO_PLATFORM with image fixture
 *   4. content script が dialog 消失で post 完了を verify する (v0.4.x で追加)
 */

import { ensureLoggedIn, loadFixture, sendPostMessage, timestampedText } from '../_lib.mjs';

const URL_GLOB = 'https://*.instagram.com/*';
const HOME_URL = 'https://www.instagram.com/';
// Create トリガーが居ること (ログイン済 home の sidebar)
const CREATE_TRIGGER = 'a[href*="/create/"], svg[aria-label*="New post"], svg[aria-label*="新規投稿"]';

export async function run({ ctx, debug }) {
  const image = await loadFixture('test-image.jpg', 'image/jpeg');
  if (!image) {
    return { ok: false, error: 'fixture scripts/e2e/fixtures/test-image.jpg が無いので skip' };
  }
  const text = timestampedText('instagram');

  const page = await ctx.newPage();
  page.on('console', (m) => {
    if (debug || m.type() === 'error') console.log(`[ig:browser:${m.type()}]`, m.text());
  });

  await page.goto(HOME_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(4000); // IG は heavy SPA、sidebar render を待つ

  const auth = await ensureLoggedIn(page, CREATE_TRIGGER, 'instagram');
  if (!auth.ok) return auth;

  const sendResult = await sendPostMessage(ctx, {
    urlGlob: URL_GLOB,
    platform: 'instagram',
    text,
    images: [image],
  });
  if (!sendResult.ok) {
    return { ok: false, error: `POST failed: ${JSON.stringify(sendResult)}` };
  }
  // content script の verifyInstagramPosted が dialog 消失を確認した上で success=true
  // を返すので、ここまで来てたら post は landed。
  return { ok: true, note: `posted: "${text.slice(0, 30)}..." (verified via dialog close)` };
}
