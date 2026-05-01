// Capture autoPost ON spinner state mid-flight.
import puppeteer from 'puppeteer-core';
const EXT_ID = 'dophemlpjldcejjdjefpjbgngodopkfe';
const browser = await puppeteer.connect({ browserURL: 'http://localhost:9222', protocolTimeout: 60000 });

for (const p of await browser.pages()) {
  if (p.url().includes('popup.html') || /mastodon\.social/.test(p.url())) await p.close();
}

const tmpImg = 'C:\\Users\\komm64\\AppData\\Local\\Temp\\tutti-test-100x100.png';
const popup = await browser.newPage();
await popup.goto(`chrome-extension://${EXT_ID}/popup.html`);
await new Promise(r => setTimeout(r, 1500));
await popup.evaluate(() => Promise.all([
  new Promise(r => chrome.storage.sync.set({ settings: { mastodonInstance: 'https://mastodon.social', misskeyInstance: 'https://misskey.io', autoPost: false, selectorOverrideUrl: '' } }, r)),
  new Promise(r => chrome.storage.session.remove('draft', r)),
  new Promise(r => chrome.storage.local.remove('selectedPlatforms', r)),
]));
await popup.reload();
await new Promise(r => setTimeout(r, 1500));
await popup.evaluate(() => document.querySelector('textarea').focus());
await popup.type('textarea', 'SPINNER STATE TEST ' + Date.now());
const fi = await popup.$('input[type="file"]');
await fi.uploadFile(tmpImg);
await new Promise(r => setTimeout(r, 1200));
// Select X + Mastodon + Tumblr (3 SNS to keep some pending while one finishes)
await popup.evaluate(() => {
  const cbs = Array.from(document.querySelectorAll('input[type="checkbox"][class*="accent-blue"]'));
  const platformCbs = cbs.slice(1);
  const want = new Set([0, 3, 5]);
  platformCbs.forEach((cb, i) => { const w = want.has(i); if (cb.checked !== w) cb.click(); });
});
await new Promise(r => setTimeout(r, 400));

await popup.evaluate(() => Array.from(document.querySelectorAll('button')).find(b => /SNS に投稿|プレビュー|Preview|Post to/.test(b.textContent ?? ''))?.click());
// Capture during 1s, 4s, 8s
for (const at of [1, 4, 8]) {
  await new Promise(r => setTimeout(r, at === 1 ? 1000 : at === 4 ? 3000 : 4000));
  await popup.screenshot({ path: `C:/Users/komm64/Projects/tutti/scripts/preview-spinner-t${at}.png` });
}

await browser.disconnect();
