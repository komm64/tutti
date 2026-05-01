// Verify: attach image in popup → close popup → reopen → image still there.
import puppeteer from 'puppeteer-core';
import { writeFileSync } from 'fs';
const EXT_ID = 'dophemlpjldcejjdjefpjbgngodopkfe';
const browser = await puppeteer.connect({ browserURL: 'http://localhost:9222', protocolTimeout: 60000 });

// Clean session storage so we start fresh
const tmpPopup = await browser.newPage();
await tmpPopup.goto(`chrome-extension://${EXT_ID}/popup.html`);
await new Promise(r => setTimeout(r, 1000));
await tmpPopup.evaluate(() => new Promise(r => chrome.storage.session.remove('draft', r)));
await tmpPopup.close();

// Phase A: open popup, attach image, type text
const tmpImg = 'C:\\Users\\komm64\\AppData\\Local\\Temp\\tutti-test-100x100.png';
const popup1 = await browser.newPage();
popup1.on('console', m => console.log('[popup1]', m.text().slice(0, 200)));
await popup1.goto(`chrome-extension://${EXT_ID}/popup.html`);
await new Promise(r => setTimeout(r, 1500));
await popup1.evaluate(() => document.querySelector('textarea').focus());
await popup1.type('textarea', 'PERSIST TEST ' + Date.now());
const fi = await popup1.$('input[type="file"]');
await fi.uploadFile(tmpImg);
console.log('image attached');
await new Promise(r => setTimeout(r, 1000)); // wait for debounced save

// Verify draft was saved with image
const savedDraft = await popup1.evaluate(() => new Promise(r => chrome.storage.session.get('draft', d => r(d.draft))));
console.log('saved draft summary:', {
  textLen: savedDraft?.text?.length,
  imageCount: savedDraft?.images?.length,
  firstImageBytes: savedDraft?.images?.[0]?.data?.length,
  hasVideo: !!savedDraft?.video,
});

// Phase B: close popup, reopen → media should restore
await popup1.close();
console.log('popup closed, reopening...');
await new Promise(r => setTimeout(r, 1000));

const popup2 = await browser.newPage();
popup2.on('console', m => console.log('[popup2]', m.text().slice(0, 200)));
await popup2.goto(`chrome-extension://${EXT_ID}/popup.html`);
await new Promise(r => setTimeout(r, 2000)); // wait for draft restore

const restored = await popup2.evaluate(() => {
  const ta = document.querySelector('textarea');
  // count image preview elements (img tag inside upload area)
  const previews = document.querySelectorAll('img[src^="blob:"], img[src^="data:image"]');
  return {
    text: ta?.value?.slice(0, 60),
    previewCount: previews.length,
    previewSrcs: Array.from(previews).map(i => i.src.slice(0, 30)),
  };
});
console.log('restored UI:', restored);
await popup2.screenshot({ path: 'scripts/popup-after-restore.png' });

await browser.disconnect();
