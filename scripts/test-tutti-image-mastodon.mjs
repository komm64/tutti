// Drive Tutti via popup, then watch Mastodon compose for image preview to appear (or not).
import puppeteer from 'puppeteer-core';
import { writeFileSync } from 'fs';

const EXT_ID = 'dophemlpjldcejjdjefpjbgngodopkfe';
const browser = await puppeteer.connect({ browserURL: 'http://localhost:9222' });

// log everything from any page
async function attachAll() {
  for (const p of await browser.pages()) {
    if (p._tutti) continue;
    p._tutti = true;
    p.on('console', m => {
      const t = m.text();
      if (t.includes('[Tutti]') || m.type() === 'error') {
        console.log(`[${p.url().slice(0, 50)} ${m.type()}]`, t.slice(0, 200));
      }
    });
  }
}
await attachAll();
browser.on('targetcreated', () => setTimeout(attachAll, 300));

const png = Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,0,0,0,0x0d,0x49,0x48,0x44,0x52,0,0,0,1,0,0,0,1,8,6,0,0,0,0x1f,0x15,0xc4,0x89,0,0,0,0x0d,0x49,0x44,0x41,0x54,0x78,0x9c,0x63,0xfc,0xcf,0xc0,0,0,0,3,0,1,0x46,0x4d,0x44,0x41,0,0,0,0,0x49,0x45,0x4e,0x44,0xae,0x42,0x60,0x82]);
const tmpImg = 'C:\\Users\\komm64\\AppData\\Local\\Temp\\tutti-test-image.png';
writeFileSync(tmpImg, png);

// Try opening popup. If blocked, fall back to direct service worker call.
let popup;
try {
  popup = await browser.newPage();
  await popup.goto(`chrome-extension://${EXT_ID}/popup.html`, { waitUntil: 'domcontentloaded' });
} catch (e) {
  console.log('popup goto failed:', e.message);
  process.exit(1);
}
await new Promise(r => setTimeout(r, 1500));

// Set settings + clear draft + reload
await popup.evaluate(() => Promise.all([
  new Promise(r => chrome.storage.sync.set({ settings: { mastodonInstance: 'https://mastodon.social', misskeyInstance: 'https://misskey.io', dryRun: true } }, r)),
  new Promise(r => chrome.storage.session.remove('draft', r)),
]));
await popup.reload({ waitUntil: 'domcontentloaded' });
await new Promise(r => setTimeout(r, 1500));

// Compose
await popup.evaluate(() => document.querySelector('textarea').focus());
await popup.type('textarea', 'TUTTI MASTODON IMG TEST ' + Date.now());
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
await popup.evaluate(() => {
  const btn = Array.from(document.querySelectorAll('button')).find(b => /SNS に投稿|Post to/.test(b.textContent ?? ''));
  btn?.click();
});

// Watch Mastodon tab over time
console.log('\n=== watching Mastodon tab ===');
let mast = null;
for (let i = 0; i < 25; i++) {
  await new Promise(r => setTimeout(r, 1000));
  const all = await browser.pages();
  mast = all.find(p => /mastodon\.social/.test(p.url()) && p !== popup);
  if (!mast) continue;
  const state = await mast.evaluate(() => {
    const fi = document.querySelector('.compose-form input[type="file"]') || document.querySelector('input[type="file"][multiple]');
    const previews = document.querySelectorAll('.compose-form img, .compose-form .compose-form__upload, .compose-form [aria-label="Edit"], button[aria-label*="Edit"]');
    const altBtn = document.querySelector('button[aria-label*="ALT" i]');
    const editBtn = document.querySelector('button[aria-label*="Edit" i]');
    return {
      url: location.href,
      fileCount: fi?.files?.length ?? 0,
      previewCount: previews.length,
      hasAlt: !!altBtn,
      hasEdit: !!editBtn,
    };
  }).catch(() => null);
  if (state) {
    console.log(`t+${i}s ${JSON.stringify(state)}`);
    if (state.previewCount > 0 || state.hasAlt || state.hasEdit) break;
  }
}
if (mast) await mast.screenshot({ path: 'C:/Users/komm64/Projects/tutti/scripts/mastodon-tutti-img.png' });

await browser.disconnect();
