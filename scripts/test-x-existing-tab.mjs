// Reproduce: user has X.com homepage open, then clicks Tutti POST.
// background's openOrFocusTab updates URL to /intent/post in existing tab.
// This may produce different DOM than fresh tab navigation.
import puppeteer from 'puppeteer-core';
const EXT_ID = 'dophemlpjldcejjdjefpjbgngodopkfe';
const browser = await puppeteer.connect({ browserURL: 'http://localhost:9222', protocolTimeout: 60000 });

// Close existing first
for (const p of await browser.pages()) {
  if (/x\.com|twitter\.com|popup\.html/.test(p.url())) await p.close();
}

// Step 1: open X.com home FIRST, simulate user having it open
const xHome = await browser.newPage();
xHome.on('console', m => { const t = m.text(); if (t.includes('[Tutti]')) console.log(`[xHome ${m.type()}]`, t.slice(0, 200)); });
await xHome.goto('https://x.com/home', { waitUntil: 'domcontentloaded' });
await new Promise(r => setTimeout(r, 5000));
console.log('X home open at:', xHome.url());

// Step 2: open popup, attach image, click POST
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
await popup.type('textarea', 'X EXISTING TAB ' + Date.now());
const fi = await popup.$('input[type="file"]');
await fi.uploadFile(tmpImg);
await new Promise(r => setTimeout(r, 1200));
await popup.evaluate(() => {
  const cbs = Array.from(document.querySelectorAll('input[type="checkbox"]'));
  cbs.forEach((cb, i) => { const want = i === 0; if (cb.checked !== want) cb.click(); });
});
await new Promise(r => setTimeout(r, 400));

// Now reattach console listener as URL changes
xHome.on('framenavigated', () => {
  console.log('xHome navigated to', xHome.url());
});

console.log('clicking POST...');
await popup.evaluate(() => Array.from(document.querySelectorAll('button')).find(b => /SNS に投稿|Post to/.test(b.textContent ?? ''))?.click());

// Track xHome state changes for 16s
for (let i = 0; i < 8; i++) {
  await new Promise(r => setTimeout(r, 2000));
  const state = await xHome.evaluate(() => {
    const inputs = Array.from(document.querySelectorAll('input[type="file"]'));
    return {
      url: location.href,
      inputCount: inputs.length,
      inputs: inputs.map((inp, idx) => ({
        idx,
        inDialog: !!inp.closest('[role="dialog"]'),
        inMain: !!inp.closest('main'),
        files: inp.files?.length ?? 0,
      })),
      dialogCount: document.querySelectorAll('[role="dialog"]').length,
      blobImgs: Array.from(document.querySelectorAll('img[src^="blob:"]')).map(img => ({
        inDialog: !!img.closest('[role="dialog"]'),
        inMain: !!img.closest('main'),
      })),
    };
  }).catch(() => null);
  console.log(`t+${i*2+2}s`, JSON.stringify(state));
  await xHome.screenshot({ path: `scripts/x-existing-${i}.png` });
}

await browser.disconnect();
