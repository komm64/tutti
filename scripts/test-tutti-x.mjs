// Verify X via full Tutti dry-run.
import puppeteer from 'puppeteer-core';
const EXT_ID = 'dophemlpjldcejjdjefpjbgngodopkfe';
const browser = await puppeteer.connect({ browserURL: 'http://localhost:9222', protocolTimeout: 60000 });

for (const p of await browser.pages()) {
  if (/x\.com|twitter\.com/.test(p.url())) await p.close();
}

async function attachAll() {
  for (const p of await browser.pages()) {
    if (p._tutti) continue;
    p._tutti = true;
    p.on('console', m => { const t = m.text(); if (t.includes('[Tutti]')) console.log(`[${p.url().slice(0,40)} ${m.type()}]`, t.slice(0, 200)); });
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
await popup.type('textarea', 'X TEST ' + Date.now());
const fi = await popup.$('input[type="file"]');
await fi.uploadFile(tmpImg);
await new Promise(r => setTimeout(r, 1200));
await popup.evaluate(() => {
  // platform order: x, bluesky, threads, mastodon, misskey, tumblr
  const cbs = Array.from(document.querySelectorAll('input[type="checkbox"]'));
  cbs.forEach((cb, i) => {
    const want = i === 0; // X is index 0
    if (cb.checked !== want) cb.click();
  });
});
await new Promise(r => setTimeout(r, 400));
// debug: state of popup before click
const debugState = await popup.evaluate(() => ({
  textVal: document.querySelector('textarea')?.value?.slice(0, 50),
  selectedX: document.querySelector('input[type="checkbox"]')?.checked,
  buttons: Array.from(document.querySelectorAll('button')).map(b => (b.textContent ?? '').slice(0,40)).filter(Boolean),
  imageCount: document.querySelectorAll('img[src^="blob:"]').length,
}));
console.log('popup state:', JSON.stringify(debugState));
console.log('=== POST ===');
const clickResult = await popup.evaluate(() => {
  const btn = Array.from(document.querySelectorAll('button')).find(b => /SNS に投稿|Post to/.test(b.textContent ?? ''));
  if (!btn) return { error: 'no post button' };
  btn.click();
  return { ok: true, btnText: btn.textContent };
});
console.log('click:', JSON.stringify(clickResult));

let tab = null;
for (let i = 0; i < 18; i++) {
  await new Promise(r => setTimeout(r, 1000));
  tab = (await browser.pages()).find(p => /x\.com|twitter\.com/.test(p.url()));
  if (!tab) continue;
  const state = await tab.evaluate(() => ({
    url: location.href,
    hasImg: !!document.querySelector('img[src^="blob:"]'),
    hasEditBtn: !!document.querySelector('[aria-label="Edit media"]'),
    hasAltBtn: !!document.querySelector('[data-testid="altTextInput"], [aria-label*="alt"]'),
    postBtn: !!document.querySelector('[data-testid="tweetButton"], [data-testid="tweetButtonInline"]'),
  })).catch(() => null);
  console.log(`t+${i}s`, JSON.stringify(state));
  if (state?.hasImg && state?.postBtn) break;
}
if (tab) await tab.screenshot({ path: 'C:/Users/komm64/Projects/tutti/scripts/x-tutti-flow.png' });

await browser.disconnect();
