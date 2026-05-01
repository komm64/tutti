// Drive Mastodon-only post via popup with dry-run, capture all logs to find where it stops.
import puppeteer from 'puppeteer-core';
import { writeFileSync } from 'fs';

const EXT_ID = 'dophemlpjldcejjdjefpjbgngodopkfe';
const browser = await puppeteer.connect({ browserURL: 'http://localhost:9222' });

const allLogs = [];
async function attachAll() {
  for (const p of await browser.pages()) {
    if (p._tutti) continue;
    p._tutti = true;
    p.on('console', (m) => {
      const t = m.text();
      if (t.includes('[Tutti]') || m.type() === 'error') {
        allLogs.push(`[${p.url().slice(0, 50)} ${m.type()}] ${t.slice(0, 250)}`);
      }
    });
    p.on('pageerror', (e) => allLogs.push(`[${p.url().slice(0, 50)} pageerror] ${e.message}`));
  }
}
await attachAll();
browser.on('targetcreated', () => setTimeout(attachAll, 300));

// Generate small image
const png = Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,0,0,0,0x0d,0x49,0x48,0x44,0x52,0,0,0,1,0,0,0,1,8,6,0,0,0,0x1f,0x15,0xc4,0x89,0,0,0,0x0d,0x49,0x44,0x41,0x54,0x78,0x9c,0x63,0xfc,0xcf,0xc0,0,0,0,3,0,1,0x46,0x4d,0x44,0x41,0,0,0,0,0x49,0x45,0x4e,0x44,0xae,0x42,0x60,0x82]);
const tmpImg = 'C:\\Users\\komm64\\AppData\\Local\\Temp\\tutti-test-image.png';
writeFileSync(tmpImg, png);

// Open popup
const popup = await browser.newPage();
await popup.goto(`chrome-extension://${EXT_ID}/popup.html`);
await new Promise(r => setTimeout(r, 1500));

// Set dry-run + clear draft
await popup.evaluate(() => Promise.all([
  new Promise(r => chrome.storage.sync.set({ settings: { mastodonInstance: 'https://mastodon.social', misskeyInstance: 'https://misskey.io', dryRun: true } }, r)),
  new Promise(r => chrome.storage.session.remove('draft', r)),
]));
await popup.reload();
await new Promise(r => setTimeout(r, 1500));
await attachAll();

// Type fresh text
await popup.evaluate(() => { const ta = document.querySelector('textarea'); ta.focus(); });
await popup.type('textarea', 'TUTTI MASTODON TEST ' + Date.now());

// Attach image
const fi = await popup.$('input[type="file"]');
await fi.uploadFile(tmpImg);
await new Promise(r => setTimeout(r, 1500));

// Uncheck all except Mastodon
await popup.evaluate(() => {
  for (const cb of Array.from(document.querySelectorAll('input[type="checkbox"]'))) {
    const want = cb.closest('label')?.textContent?.includes('Mastodon');
    if (cb.checked !== want) cb.click();
  }
});
await new Promise(r => setTimeout(r, 400));

console.log('=== POST clicked ===');
await popup.evaluate(() => {
  const btn = Array.from(document.querySelectorAll('button')).find(b => /SNS に投稿|Post to/.test(b.textContent ?? ''));
  btn?.click();
});

await new Promise(r => setTimeout(r, 18000));

// Check Mastodon tab
const mast = (await browser.pages()).find(p => /mastodon\.social\/share/.test(p.url())) ?? (await browser.pages()).find(p => /mastodon\.social/.test(p.url()) && p !== popup);
if (mast) {
  console.log('mastodon URL:', mast.url());
  const state = await mast.evaluate(() => {
    const ta = document.querySelector('textarea.autosuggest-textarea__textarea');
    const submitBtn = document.querySelector('button.button[type="submit"]');
    const fi = document.querySelector('.compose-form input[type="file"], input[type="file"][multiple]');
    // post button outline (dry-run marker)
    const outline = submitBtn?.style.outline;
    return {
      textareaValue: ta?.value?.slice(0, 100),
      submitBtnFound: !!submitBtn,
      submitBtnDisabled: submitBtn?.disabled,
      submitBtnOutline: outline,
      fileInputFound: !!fi,
      fileInputHasFiles: fi?.files?.length ?? 0,
    };
  });
  console.log('mastodon state:', JSON.stringify(state, null, 2));
  await mast.screenshot({ path: 'scripts/mastodon-after-post.png' });
}

console.log('\n=== logs ===');
for (const l of allLogs) console.log(l.slice(0, 300));

await browser.disconnect();
