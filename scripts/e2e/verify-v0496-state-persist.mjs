/**
 * v0.4.96 verify: 投稿完了後も postingStateInMemory が保持されて、 popup 再 open で
 * 最終結果が GET_BG_STATE 経由で復元できるか。
 *
 * user 報告: wizard SNS が foreground tab を開いて popup が閉じた後、 再 open すると
 * 進捗・エラー dialog が全部消えてた。 完了直後に bg state を null 化していたのが
 * 原因。 v0.4.96 で done=true で保持するように変更。
 */
import puppeteer from 'puppeteer-core';

const browser = await puppeteer.connect({
  browserURL: 'http://localhost:9222',
  defaultViewport: null,
  protocolTimeout: 90000,
});
const EXT_ID = 'dophemlpjldcejjdjefpjbgngodopkfe';

let sw = browser.targets().find((t) => t.type() === 'service_worker' && t.url().includes(EXT_ID));
if (!sw) {
  const p = await browser.newPage();
  try { await p.goto(`chrome-extension://${EXT_ID}/popup.html`, { timeout: 8000 }); } catch {}
  for (let i = 0; i < 50; i++) {
    sw = browser.targets().find((t) => t.type() === 'service_worker' && t.url().includes(EXT_ID));
    if (sw) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  await p.close().catch(() => {});
}
const worker = await sw.worker();

// popup を開く (POST_REQUEST 送信元として)
const popupPage = await browser.newPage();
await popupPage.goto(`chrome-extension://${EXT_ID}/popup.html`, { timeout: 8000 });
await new Promise((r) => setTimeout(r, 1500));

// autoPost=false にしておく (preview mode 投稿、 実投稿しない)
await popupPage.evaluate(async () => {
  const { settings } = await chrome.storage.sync.get('settings');
  await chrome.storage.sync.set({ settings: { ...(settings ?? {}), autoPost: false } });
});

// Bluesky tab を開いておく
let bskyPage = (await browser.pages()).find((p) => /bsky\.app/.test(p.url()));
if (!bskyPage) bskyPage = await browser.newPage();
await bskyPage.goto('https://bsky.app/intent/compose?text=', { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
await new Promise((r) => setTimeout(r, 3000));

// POST_REQUEST を送信 (bluesky だけ、 preview mode で即 success)
console.log('=== POST_REQUEST 送信 ===');
const postResult = await popupPage.evaluate(async () => {
  return await chrome.runtime.sendMessage({
    type: 'POST_REQUEST',
    text: 'v0.4.96 state persist verify',
    platforms: ['bluesky'],
  });
});
console.log('post result:', JSON.stringify(postResult, null, 2));

// 完了 ~1s 後、 popup を「閉じて」(close) GET_BG_STATE で state が残ってるか確認
await popupPage.close().catch(() => {});
await new Promise((r) => setTimeout(r, 1500));

console.log('\n=== 完了後 GET_BG_STATE (popup 再 open 想定) ===');
const popupPage2 = await browser.newPage();
await popupPage2.goto(`chrome-extension://${EXT_ID}/popup.html`, { timeout: 8000 });
await new Promise((r) => setTimeout(r, 1500));

const state = await popupPage2.evaluate(async () => {
  return await chrome.runtime.sendMessage({ type: 'GET_BG_STATE' });
});
console.log('bg state:', JSON.stringify(state, null, 2));

// クリアして次の post に備える
const clearRes = await popupPage2.evaluate(async () => {
  return await chrome.runtime.sendMessage({ type: 'CLEAR_POSTING_STATE' });
});
console.log('\nclear result:', JSON.stringify(clearRes, null, 2));

// クリア後の state も確認
const stateAfterClear = await popupPage2.evaluate(async () => {
  return await chrome.runtime.sendMessage({ type: 'GET_BG_STATE' });
});
console.log('bg state after clear:', JSON.stringify(stateAfterClear, null, 2));

await popupPage2.close().catch(() => {});
browser.disconnect();
