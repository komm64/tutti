/**
 * YouTube detector が null を返したとき stale 値が clear されるか verify。
 * Surface dummy は YT logged out なので、 detector は null を返すはず。
 * REFRESH_USER 後に lastSeenUsers から youtube key が消えてること。
 */
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.connect({ browserURL: 'http://localhost:9222', defaultViewport: null, protocolTimeout: 60000 });
const EXT_ID = 'dophemlpjldcejjdjefpjbgngodopkfe';

let sw = browser.targets().find((t) => t.type() === 'service_worker' && t.url().includes(EXT_ID));
if (!sw) {
  // wake SW via popup
  const p = await browser.newPage();
  try { await p.goto(`chrome-extension://${EXT_ID}/popup.html`, { timeout: 8000 }); } catch {}
  for (let i = 0; i < 50; i++) {
    sw = browser.targets().find((t) => t.type() === 'service_worker' && t.url().includes(EXT_ID));
    if (sw) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  await p.close().catch(() => {});
}

// worker は使わない (chrome.runtime.sendMessage は popup から打つ)
const popupPage = await browser.newPage();
await popupPage.goto(`chrome-extension://${EXT_ID}/popup.html`, { timeout: 8000 });
await new Promise((r) => setTimeout(r, 1500));

// stale 値を強制 set
await popupPage.evaluate(async () => {
  const { lastSeenUsers } = await chrome.storage.local.get('lastSeenUsers');
  await chrome.storage.local.set({
    lastSeenUsers: { ...(lastSeenUsers ?? {}), youtube: 'Account' },
  });
});
const before = await popupPage.evaluate(async () => {
  return (await chrome.storage.local.get('lastSeenUsers')).lastSeenUsers;
});
console.log('before stale set:', JSON.stringify(before?.youtube));
await popupPage.close().catch(() => {});

// popup を新規に open → getLastSeenUsers → filter 走る
const popupPage2 = await browser.newPage();
await popupPage2.goto(`chrome-extension://${EXT_ID}/popup.html`, { timeout: 8000 });
await new Promise((r) => setTimeout(r, 2500));

const after = await popupPage2.evaluate(async () => {
  return (await chrome.storage.local.get('lastSeenUsers')).lastSeenUsers;
});
console.log('\nafter popup mount (filter pass):', JSON.stringify(after, null, 2));
console.log('\nyoutube key:', after?.youtube ?? '(cleared / absent)');
await popupPage2.close().catch(() => {});

await popupPage.close().catch(() => {});
browser.disconnect();
