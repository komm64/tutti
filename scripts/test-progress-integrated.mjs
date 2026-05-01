// Verify v0.4.6: progress integrated into SNS rows, preview wording instead of "Posting..."
import puppeteer from 'puppeteer-core';
const EXT_ID = 'dophemlpjldcejjdjefpjbgngodopkfe';
const browser = await puppeteer.connect({ browserURL: 'http://localhost:9222', protocolTimeout: 60000 });

for (const p of await browser.pages()) {
  if (p.url().includes('popup.html') || /x\.com|mastodon\.social/.test(p.url())) await p.close();
}

const tmpImg = 'C:\\Users\\komm64\\AppData\\Local\\Temp\\tutti-test-100x100.png';

const popup = await browser.newPage();
await popup.goto(`chrome-extension://${EXT_ID}/popup.html`);
await new Promise(r => setTimeout(r, 1500));
// autoPost: false (preview)
await popup.evaluate(() => Promise.all([
  new Promise(r => chrome.storage.sync.set({ settings: { mastodonInstance: 'https://mastodon.social', misskeyInstance: 'https://misskey.io', autoPost: false, selectorOverrideUrl: '' } }, r)),
  new Promise(r => chrome.storage.session.remove('draft', r)),
  new Promise(r => chrome.storage.local.remove('selectedPlatforms', r)),
]));
await popup.reload();
await new Promise(r => setTimeout(r, 1500));

await popup.evaluate(() => document.querySelector('textarea').focus());
await popup.type('textarea', 'PREVIEW UI TEST ' + Date.now());
const fi = await popup.$('input[type="file"]');
await fi.uploadFile(tmpImg);
await new Promise(r => setTimeout(r, 1200));
// Select X + Mastodon
await popup.evaluate(() => {
  const cbs = Array.from(document.querySelectorAll('input[type="checkbox"][class*="accent-blue"]'));
  const platformCbs = cbs.slice(1);
  const want = new Set([0, 3]);
  platformCbs.forEach((cb, i) => { const w = want.has(i); if (cb.checked !== w) cb.click(); });
});
await new Promise(r => setTimeout(r, 400));

await popup.screenshot({ path: 'scripts/preview-before-click.png' });

await popup.evaluate(() => Array.from(document.querySelectorAll('button')).find(b => /SNS に投稿|プレビュー|Preview|Post to/.test(b.textContent ?? ''))?.click());

// Snapshot at 3s, 8s, 15s
for (const at of [3, 8, 15]) {
  await new Promise(r => setTimeout(r, (at - (at === 3 ? 0 : at === 8 ? 3 : 8)) * 1000));
  // Just sleep relative; this is approximate but fine
}
// Actually just take 1 mid-run shot at 5s, then final
await popup.screenshot({ path: 'scripts/preview-mid.png' });
await new Promise(r => setTimeout(r, 8000));
await popup.screenshot({ path: 'scripts/preview-final.png' });

await browser.disconnect();
