import puppeteer from 'puppeteer-core';
const browser = await puppeteer.connect({ browserURL: 'http://localhost:9222', defaultViewport: null, protocolTimeout: 60000 });

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

// Pixiv と IG tab を reload して content script を fresh load させる
for (const host of ['pixiv.net', 'instagram.com']) {
  const pages = await browser.pages();
  const tab = pages.find((p) => new RegExp(host.replace('.', '\\.')).test(p.url()) && !/static/.test(p.url()));
  if (!tab) { console.log(`no ${host} tab`); continue; }
  await tab.bringToFront();
  await tab.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
  await new Promise((r) => setTimeout(r, 10000)); // IG は重い、 10s 待つ
  console.log(`reloaded ${host}`);
}

// 各 SNS tab に REFRESH_USER を broadcast して結果を sw の lastSeenUsers から確認
await worker.evaluate(async () => {
  const tabs = await chrome.tabs.query({});
  for (const t of tabs) {
    if (!t.id || !t.url) continue;
    if (/pixiv\.net|instagram\.com/.test(t.url)) {
      try { await chrome.tabs.sendMessage(t.id, { type: 'REFRESH_USER' }); } catch {}
    }
  }
  await new Promise((r) => setTimeout(r, 2000));
});

// lastSeenUsers を読む
const popupPage = await browser.newPage();
await popupPage.goto(`chrome-extension://${EXT_ID}/popup.html`, { timeout: 8000 });
await new Promise((r) => setTimeout(r, 1500));
const lastSeen = await popupPage.evaluate(async () => {
  return await chrome.storage.local.get('lastSeenUsers');
});
console.log('lastSeenUsers:', JSON.stringify(lastSeen, null, 2));
await popupPage.close().catch(() => {});
browser.disconnect();
