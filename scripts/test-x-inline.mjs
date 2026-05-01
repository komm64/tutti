// Verify v0.3.8: X uses home inline compose, no modal.
import puppeteer from 'puppeteer-core';
const EXT_ID = 'dophemlpjldcejjdjefpjbgngodopkfe';
const browser = await puppeteer.connect({ browserURL: 'http://localhost:9222', protocolTimeout: 60000 });

for (const p of await browser.pages()) {
  if (/x\.com|twitter\.com|popup\.html/.test(p.url())) await p.close();
}

async function attachAll() {
  for (const p of await browser.pages()) {
    if (p._tutti) continue;
    p._tutti = true;
    p.on('console', m => { const t = m.text(); if (t.includes('[Tutti]')) console.log(`[${p.url().slice(0,40)}]`, t.slice(0, 200)); });
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
await popup.type('textarea', 'X INLINE TEST ' + Date.now());
const fi = await popup.$('input[type="file"]');
await fi.uploadFile(tmpImg);
await new Promise(r => setTimeout(r, 1200));
await popup.evaluate(() => {
  const cbs = Array.from(document.querySelectorAll('input[type="checkbox"]'));
  cbs.forEach((cb, i) => { const want = i === 0; if (cb.checked !== want) cb.click(); });
});
await new Promise(r => setTimeout(r, 400));
console.log('=== POST ===');
await popup.evaluate(() => Array.from(document.querySelectorAll('button')).find(b => /SNS に投稿|Post to/.test(b.textContent ?? ''))?.click());

let tab = null;
for (let i = 0; i < 18; i++) {
  await new Promise(r => setTimeout(r, 1000));
  tab = (await browser.pages()).find(p => /x\.com|twitter\.com/.test(p.url()));
  if (!tab) continue;
  const state = await tab.evaluate(() => {
    const inputs = Array.from(document.querySelectorAll('input[type="file"]'));
    const blobs = Array.from(document.querySelectorAll('img[src^="blob:"]'));
    return {
      url: location.href,
      dialogCount: document.querySelectorAll('[role="dialog"]').length,
      hasInlineTextarea: !!document.querySelector('main [data-testid="tweetTextarea_0"]'),
      inlineTextareaText: document.querySelector('main [data-testid="tweetTextarea_0"]')?.innerText?.slice(0, 60),
      blobImgsLocations: blobs.map(b => ({
        inDialog: !!b.closest('[role="dialog"]'),
        inMain: !!b.closest('main'),
      })),
    };
  }).catch(() => null);
  console.log(`t+${i+1}s`, JSON.stringify(state));
}
// keep going for 10s after first detection so we can see image complete
await new Promise(r => setTimeout(r, 5000));
const finalState = tab && await tab.evaluate(() => {
  const ta = document.querySelector('main [data-testid="tweetTextarea_0"]');
  const blobs = Array.from(document.querySelectorAll('img[src^="blob:"]'));
  return {
    text: ta?.innerText?.slice(0, 80),
    blobImgs: blobs.map(b => ({ inDialog: !!b.closest('[role="dialog"]'), inMain: !!b.closest('main') })),
    inlinePostBtnEnabled: !document.querySelector('[data-testid="tweetButtonInline"]')?.disabled
                          && document.querySelector('[data-testid="tweetButtonInline"]')?.getAttribute('aria-disabled') !== 'true',
    dialogCount: document.querySelectorAll('[role="dialog"]').length,
  };
}).catch(() => null);
console.log('FINAL:', JSON.stringify(finalState));
if (tab) await tab.screenshot({ path: 'scripts/x-inline-test.png' });

await browser.disconnect();
