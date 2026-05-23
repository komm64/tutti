/**
 * v0.4.100 verify: 投稿中の popup re-open で badge が消えない (旧 clearBadge bug 修正)。
 *
 * sequence:
 * 1. POST_REQUEST 流す (返り値は await しない)
 * 2. 100ms 内に GET_BG_STATE (popup re-open 想定) → badge は clear されないはず
 * 3. 投稿完了を待つ
 * 4. GET_BG_STATE (完了済 + popup re-open) → badge は clear されるはず
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

const popupPage = await browser.newPage();
await popupPage.goto(`chrome-extension://${EXT_ID}/popup.html`, { timeout: 8000 });
await new Promise((r) => setTimeout(r, 1500));

await popupPage.evaluate(async () => {
  const { settings } = await chrome.storage.sync.get('settings');
  await chrome.storage.sync.set({ settings: { ...(settings ?? {}), autoPost: false } });
});

// Bluesky tab を開いておく
let bskyPage = (await browser.pages()).find((p) => /bsky\.app/.test(p.url()));
if (!bskyPage) bskyPage = await browser.newPage();
await bskyPage.goto('https://bsky.app/intent/compose?text=', { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
await new Promise((r) => setTimeout(r, 3000));

async function getBadge() {
  return await worker.evaluate(async () => await chrome.action.getBadgeText({}));
}

console.log('badge before:', JSON.stringify(await getBadge()));

// POST_REQUEST を放置 (await しない)
const postPromise = popupPage.evaluate(async () => {
  return await chrome.runtime.sendMessage({
    type: 'POST_REQUEST',
    text: 'badge stability verify',
    platforms: ['bluesky'],
  });
});

// 進行中に GET_BG_STATE を打って badge が消えないこと
await new Promise((r) => setTimeout(r, 500));
console.log('\n[posting in progress]');
console.log('badge before GET_BG_STATE:', JSON.stringify(await getBadge()));
await popupPage.evaluate(async () => {
  await chrome.runtime.sendMessage({ type: 'GET_BG_STATE' });
});
console.log('badge after GET_BG_STATE (期待: 持続):', JSON.stringify(await getBadge()));

await postPromise;
await new Promise((r) => setTimeout(r, 500));
console.log('\n[posting done]');
console.log('badge after completion:', JSON.stringify(await getBadge()));

await popupPage.evaluate(async () => {
  await chrome.runtime.sendMessage({ type: 'GET_BG_STATE' });
});
console.log('badge after GET_BG_STATE on done state (期待: clear):', JSON.stringify(await getBadge()));

await popupPage.close().catch(() => {});
browser.disconnect();
