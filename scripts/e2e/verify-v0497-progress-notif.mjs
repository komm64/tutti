/**
 * v0.4.97 verify: 投稿中の progress badge ("N/M" 青) + 完了時の chrome.notifications。
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

// popup 開いて POST_REQUEST 流す
const popupPage = await browser.newPage();
await popupPage.goto(`chrome-extension://${EXT_ID}/popup.html`, { timeout: 8000 });
await new Promise((r) => setTimeout(r, 1500));

// autoPost=false (preview) 強制
await popupPage.evaluate(async () => {
  const { settings } = await chrome.storage.sync.get('settings');
  await chrome.storage.sync.set({ settings: { ...(settings ?? {}), autoPost: false } });
});

// Bluesky tab 開いておく
let bskyPage = (await browser.pages()).find((p) => /bsky\.app/.test(p.url()));
if (!bskyPage) bskyPage = await browser.newPage();
await bskyPage.goto('https://bsky.app/intent/compose?text=', { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
await new Promise((r) => setTimeout(r, 3000));

// Badge を確認する補助
async function getBadgeText() {
  return await worker.evaluate(async () => {
    return await chrome.action.getBadgeText({});
  });
}

console.log('badge before post:', JSON.stringify(await getBadgeText()));

// POST_REQUEST 起動 (返り値待たずに進めて progress badge を観察)
const postPromise = popupPage.evaluate(async () => {
  return await chrome.runtime.sendMessage({
    type: 'POST_REQUEST',
    text: 'v0.4.97 progress + notif verify',
    platforms: ['bluesky'],
  });
});

// 投稿中の badge (0/1) を捉える
await new Promise((r) => setTimeout(r, 500));
console.log('badge during post (期待: 0/1 or 1/1):', JSON.stringify(await getBadgeText()));

const result = await postPromise;
console.log('post result:', JSON.stringify(result, null, 2));

await new Promise((r) => setTimeout(r, 500));
console.log('badge after post (期待: OK):', JSON.stringify(await getBadgeText()));

// popup を再 open simulation で badge clear (GET_BG_STATE)
await popupPage.evaluate(async () => {
  await chrome.runtime.sendMessage({ type: 'GET_BG_STATE' });
});
await new Promise((r) => setTimeout(r, 300));
console.log('badge after GET_BG_STATE (期待: ""):', JSON.stringify(await getBadgeText()));

await popupPage.close().catch(() => {});
browser.disconnect();
