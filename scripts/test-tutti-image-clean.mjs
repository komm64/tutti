import puppeteer from 'puppeteer-core';
import { writeFileSync } from 'fs';
const EXT_ID = 'dophemlpjldcejjdjefpjbgngodopkfe';
const browser = await puppeteer.connect({ browserURL: 'http://localhost:9222' });

// Close all mastodon tabs first
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

const png = Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,0,0,0,0x0d,0x49,0x48,0x44,0x52,0,0,0,1,0,0,0,1,8,6,0,0,0,0x1f,0x15,0xc4,0x89,0,0,0,0x0d,0x49,0x44,0x41,0x54,0x78,0x9c,0x63,0xfc,0xcf,0xc0,0,0,0,3,0,1,0x46,0x4d,0x44,0x41,0,0,0,0,0x49,0x45,0x4e,0x44,0xae,0x42,0x60,0x82]);
const tmpImg = 'C:\\Users\\komm64\\AppData\\Local\\Temp\\tutti-test-image.png';
writeFileSync(tmpImg, png);

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
await popup.type('textarea', 'CLEAN MASTODON ' + Date.now());
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
console.log('=== POST clicked at', new Date().toISOString());
await popup.evaluate(() => Array.from(document.querySelectorAll('button')).find(b => /SNS に投稿|Post to/.test(b.textContent ?? ''))?.click());

let mast = null;
for (let i = 0; i < 25; i++) {
  await new Promise(r => setTimeout(r, 1000));
  mast = (await browser.pages()).find(p => /mastodon\.social/.test(p.url()));
  if (!mast) { console.log(`t+${i}s no tab yet`); continue; }
  const state = await mast.evaluate(() => {
    const fi = document.querySelector('.compose-form input[type="file"]') || document.querySelector('input[type="file"][multiple]');
    const editBtn = document.querySelector('.compose-form button[aria-label*="Edit"]');
    const altBtn = document.querySelector('.compose-form button[aria-label*="ALT"]');
    const removeBtn = document.querySelector('.compose-form button[aria-label*="Remove"]');
    return {
      url: location.href,
      fileCount: fi?.files?.length ?? 0,
      hasEdit: !!editBtn,
      hasAlt: !!altBtn,
      hasRemove: !!removeBtn,
    };
  }).catch(() => null);
  console.log(`t+${i}s`, JSON.stringify(state));
  if (state?.hasEdit || state?.hasAlt) break;
}
if (mast) await mast.screenshot({ path: 'scripts/mastodon-clean-test.png' });

await browser.disconnect();
