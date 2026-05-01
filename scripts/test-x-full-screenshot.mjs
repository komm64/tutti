// Reproduce X's two-compose-form scenario the user described.
// Dry-run with image, screenshot at multiple stages, identify which form has the image.
import puppeteer from 'puppeteer-core';
const EXT_ID = 'dophemlpjldcejjdjefpjbgngodopkfe';
const browser = await puppeteer.connect({ browserURL: 'http://localhost:9222', protocolTimeout: 60000 });

for (const p of await browser.pages()) {
  if (/x\.com|twitter\.com|popup/.test(p.url())) await p.close();
}

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
await popup.type('textarea', 'X TWO FORMS ' + Date.now());
const fi = await popup.$('input[type="file"]');
await fi.uploadFile(tmpImg);
await new Promise(r => setTimeout(r, 1200));
await popup.evaluate(() => {
  const cbs = Array.from(document.querySelectorAll('input[type="checkbox"]'));
  cbs.forEach((cb, i) => { const want = i === 0; if (cb.checked !== want) cb.click(); });
});
await new Promise(r => setTimeout(r, 400));
await popup.evaluate(() => Array.from(document.querySelectorAll('button')).find(b => /SNS に投稿|Post to/.test(b.textContent ?? ''))?.click());

// Wait for X tab + take screenshots at 3 different points
let tab = null;
for (let i = 0; i < 12; i++) {
  await new Promise(r => setTimeout(r, 800));
  tab = (await browser.pages()).find(p => /x\.com|twitter\.com/.test(p.url()));
  if (tab) break;
}
if (!tab) { console.log('no X tab'); process.exit(1); }
console.log('X tab opened:', tab.url());

// Snapshot every 2s for 16s
for (let i = 0; i < 8; i++) {
  await new Promise(r => setTimeout(r, 2000));
  const state = await tab.evaluate(() => {
    const inputs = Array.from(document.querySelectorAll('input[type="file"]'));
    const inputInfo = inputs.map((inp, idx) => {
      // Determine which compose container this input belongs to
      const inDialog = !!inp.closest('[role="dialog"]');
      const inMain = !!inp.closest('main');
      // Has files?
      const hasFiles = (inp.files?.length ?? 0) > 0;
      return { idx, inDialog, inMain, hasFiles };
    });
    // Image previews
    const blobImgs = Array.from(document.querySelectorAll('img[src^="blob:"]'));
    const blobImgsInfo = blobImgs.map(img => {
      const inDialog = !!img.closest('[role="dialog"]');
      const inMain = !!img.closest('main');
      return { inDialog, inMain };
    });
    return { fileInputs: inputInfo, blobImgs: blobImgsInfo };
  });
  console.log(`t+${i*2+2}s`, JSON.stringify(state));
  await tab.screenshot({ path: `scripts/x-form-state-${i}.png` });
}

await browser.disconnect();
