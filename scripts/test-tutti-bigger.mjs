import puppeteer from 'puppeteer-core';
import { readFileSync } from 'fs';
const EXT_ID = 'dophemlpjldcejjdjefpjbgngodopkfe';
const browser = await puppeteer.connect({ browserURL: 'http://localhost:9222' });

for (const p of await browser.pages()) {
  if (/mastodon\.social/.test(p.url())) await p.close();
}

async function attachAll() {
  for (const p of await browser.pages()) {
    if (p._tutti) continue;
    p._tutti = true;
    p.on('console', m => { const t = m.text(); if (t.includes('[Tutti]') || m.type() === 'error') console.log(`[${p.url().slice(0,50)} ${m.type()}]`, t.slice(0, 200)); });
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
await popup.type('textarea', 'BIG MASTODON ' + Date.now());
const fi = await popup.$('input[type="file"]');
await fi.uploadFile(tmpImg);
await new Promise(r => setTimeout(r, 1500));
await popup.evaluate(() => {
  for (const cb of Array.from(document.querySelectorAll('input[type="checkbox"]'))) {
    const want = cb.closest('label')?.textContent?.includes('Mastodon');
    if (cb.checked !== want) cb.click();
  }
});
await new Promise(r => setTimeout(r, 400));
console.log('=== POST ===');
await popup.evaluate(() => Array.from(document.querySelectorAll('button')).find(b => /SNS に投稿|Post to/.test(b.textContent ?? ''))?.click());

let mast = null;
for (let i = 0; i < 25; i++) {
  await new Promise(r => setTimeout(r, 1000));
  mast = (await browser.pages()).find(p => /mastodon\.social/.test(p.url()));
  if (!mast) continue;
  const state = await mast.evaluate(() => ({
    fileCount: (document.querySelector('.compose-form input[type="file"]') || document.querySelector('input[type="file"][multiple]'))?.files?.length ?? 0,
    hasEdit: !!document.querySelector('.compose-form button[aria-label*="Edit"]'),
    hasAlt: !!document.querySelector('.compose-form button[aria-label*="ALT"]'),
  })).catch(() => null);
  console.log(`t+${i}s`, JSON.stringify(state));
  if (state?.hasEdit || state?.hasAlt) break;
}
if (mast) await mast.screenshot({ path: 'scripts/mastodon-bigger.png' });

await browser.disconnect();
