// End-to-end: drive Tutti popup → POST with image to Tumblr only.
import puppeteer from 'puppeteer-core';
const EXT_ID = 'dophemlpjldcejjdjefpjbgngodopkfe';
const browser = await puppeteer.connect({ browserURL: 'http://localhost:9222', protocolTimeout: 60000 });

for (const p of await browser.pages()) {
  if (/tumblr\.com/.test(p.url())) await p.close();
}

async function attachAll() {
  for (const p of await browser.pages()) {
    if (p._tutti) continue;
    p._tutti = true;
    p.on('console', m => { const t = m.text(); if (t.includes('[Tutti]') || m.type() === 'error') console.log(`[${p.url().slice(0,50)} ${m.type()}]`, t.slice(0, 200)); });
    p.on('response', r => { if (!r.ok() && /\/api\//.test(r.url())) console.log(`[NET ${r.status()}]`, r.url().slice(0, 100)); });
  }
}
await attachAll();
browser.on('targetcreated', () => setTimeout(attachAll, 300));

const tmpImg = 'C:\\Users\\komm64\\AppData\\Local\\Temp\\tutti-test-100x100.png';

const popup = await browser.newPage();
await popup.goto(`chrome-extension://${EXT_ID}/popup.html`);
await new Promise(r => setTimeout(r, 1500));
await popup.evaluate(() => Promise.all([
  new Promise(r => chrome.storage.sync.set({ settings: { mastodonInstance: 'https://mastodon.social', misskeyInstance: 'https://misskey.io', dryRun: true } }, r)),
  new Promise(r => chrome.storage.session.remove('draft', r)),
]));
await popup.reload();
await new Promise(r => setTimeout(r, 1500));

await popup.evaluate(() => document.querySelector('textarea').focus());
await popup.type('textarea', 'TUMBLR IMG TEST ' + Date.now());
const fi = await popup.$('input[type="file"]');
await fi.uploadFile(tmpImg);
await new Promise(r => setTimeout(r, 1500));
await popup.evaluate(() => {
  for (const cb of Array.from(document.querySelectorAll('input[type="checkbox"]'))) {
    const want = cb.closest('label')?.textContent?.includes('Tumblr');
    if (cb.checked !== want) cb.click();
  }
});
await new Promise(r => setTimeout(r, 400));
console.log('=== POST ===');
await popup.evaluate(() => Array.from(document.querySelectorAll('button')).find(b => /SNS に投稿|Post to/.test(b.textContent ?? ''))?.click());

let tab = null;
for (let i = 0; i < 20; i++) {
  await new Promise(r => setTimeout(r, 1000));
  tab = (await browser.pages()).find(p => /tumblr\.com\/new/.test(p.url()));
  if (!tab) continue;
  const state = await tab.evaluate(() => ({
    url: location.href,
    bodyText: document.body.innerText.slice(0, 300),
    hasImageBlock: document.querySelectorAll('[data-block-type="image"], figure').length,
    bodyHasUpload: /Upload|Replace|Crop/i.test(document.body.innerText),
    composeEditableCount: document.querySelectorAll('[role="dialog"] [contenteditable="true"]').length,
  })).catch(() => null);
  console.log(`t+${i}s`, JSON.stringify(state).slice(0, 300));
  if (state?.bodyHasUpload) break;
}
if (tab) await tab.screenshot({ path: 'C:/Users/komm64/Projects/tutti/scripts/tumblr-tutti-flow.png' });

await browser.disconnect();
