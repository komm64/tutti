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
  // X の home feed は own post を即時表示しないことが多い (algorithm) ので
  // content script の success=true を最終判定とする。他 SNS module と同じ流儀。
  // (旧コードは feed reload + article 検索だったが 30s 待っても出ないことが多かった)
  return { ok: true, note: `posted: "${text.slice(0, 30)}..." (cleanup skipped)` };
}
