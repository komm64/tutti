/**
 * X (twitter.com) E2E real-post test
 *
 * 流れ:
 *   1. https://x.com/home に navigate
 *   2. ログイン状態確認 (失敗なら skip)
 *   3. 拡張の background に POST_REQUEST を直接投げる (popup UI 経由しない)
 *   4. /home の compose に投稿が反映されたかを DOM で確認
 *   5. 投稿後の URL から tweet ID を取得 → 削除リクエスト
 *
 * 5 の削除は X UI からだと「メニュー → Delete」の流れで複雑。今は v1 として
 *   skip = 投稿は test 垢の timeline に残る (test 垢なので問題なし)。
 *   v2 で gh-style cleanup script を別途用意する想定。
 */

const TEST_TEXT = `tutti e2e smoke ${new Date().toISOString()}`;

export async function run({ ctx, extensionId, debug }) {
  const page = await ctx.newPage();
  page.on('console', (m) => {
    if (debug || m.type() === 'error') console.log(`[x:browser:${m.type()}]`, m.text());
  });

  await page.goto('https://x.com/home', { waitUntil: 'domcontentloaded', timeout: 30000 });

  // ログイン状態判定: compose textarea が居る = ログイン済
  const loggedIn = await page.locator('[data-testid="tweetTextarea_0"]').count()
    .then((n) => n > 0)
    .catch(() => false);
  if (!loggedIn) {
    return { ok: false, error: 'not logged in (test account session expired?)' };
  }

  // 背景 service worker に POST_REQUEST を送る。popup UI を経由しないので
  // E2E は popup の状態管理 / autoPost 設定とは独立にテストできる
  const sendResult = await ctx.serviceWorkers()[0].evaluate(
    async ({ text }) => {
      // Service worker context: chrome.runtime.sendMessage はこの context では
      // 自分自身に届かない (popup から呼ぶ前提)。直接 background のハンドラを
      // 呼びたいので chrome.runtime.connect は使わず、tabs API で content script
      // に直送する形にする
      const tabs = await chrome.tabs.query({ url: 'https://x.com/*' });
      const tab = tabs[0];
      if (!tab) return { ok: false, error: 'no x.com tab' };
      const result = await chrome.tabs.sendMessage(tab.id, {
        type: 'POST_TO_PLATFORM',
        platform: 'x',
        text,
        autoPost: true,
      });
      return { ok: result?.success === true, raw: result };
    },
    { text: TEST_TEXT },
  );

  if (!sendResult.ok) {
    return { ok: false, error: `POST failed: ${JSON.stringify(sendResult)}` };
  }

  // home のフィードに自分の投稿が出るかを 30s 内で確認
  await page.reload({ waitUntil: 'domcontentloaded' });
  const found = await page.waitForSelector(`article:has-text("${TEST_TEXT}")`, { timeout: 30000 })
    .then(() => true)
    .catch(() => false);

  if (!found) {
    return { ok: false, error: 'posted text not found in feed within 30s' };
  }

  // v2: 削除はここで実装
  return { ok: true, note: `posted: "${TEST_TEXT.slice(0, 30)}..."` };
}
