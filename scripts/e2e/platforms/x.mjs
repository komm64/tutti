/**
 * X (twitter.com) E2E real-post test
 *
 * 流れ:
 *   1. https://x.com/home に navigate
 *   2. ログイン状態確認 (compose textarea が居る = ログイン済)
 *   3. 拡張の background に POST_TO_PLATFORM を直接投げる
 *   4. /home の compose に投稿が反映されたかを DOM で確認
 *
 * Cleanup は未実装 (X の Delete は menu→Delete の 2-step で fragile)。
 * test 垢の timeline に投稿は残る = test 垢なので問題なし
 */

import { ensureLoggedIn, sendPostMessage, timestampedText } from '../_lib.mjs';

const URL_GLOB = 'https://x.com/*';

export async function run({ ctx, debug }) {
  const text = timestampedText('x');
  const page = await ctx.newPage();
  page.on('console', (m) => {
    if (debug || m.type() === 'error') console.log(`[x:browser:${m.type()}]`, m.text());
  });

  await page.goto('https://x.com/home', { waitUntil: 'domcontentloaded', timeout: 30000 });

  const auth = await ensureLoggedIn(page, '[data-testid="tweetTextarea_0"]', 'x');
  if (!auth.ok) return auth;

  const sendResult = await sendPostMessage(ctx, {
    urlGlob: URL_GLOB,
    platform: 'x',
    text,
  });
  if (!sendResult.ok) {
    return { ok: false, error: `POST failed: ${JSON.stringify(sendResult)}` };
  }

  // home のフィードに自分の投稿が出るかを 30s 内で確認
  await page.reload({ waitUntil: 'domcontentloaded' });
  const found = await page.waitForSelector(`article:has-text("${text}")`, { timeout: 30000 })
    .then(() => true)
    .catch(() => false);
  if (!found) return { ok: false, error: 'posted text not found in feed within 30s' };

  return { ok: true, note: `posted: "${text.slice(0, 30)}..."` };
}
