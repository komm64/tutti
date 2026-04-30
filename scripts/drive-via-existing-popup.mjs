import puppeteer from 'puppeteer-core';
import { writeFileSync } from 'fs';
const EXT_ID = 'dophemlpjldcejjdjefpjbgngodopkfe';
const browser = await puppeteer.connect({ browserURL: 'http://localhost:9222' });

// Find existing popup pages (left over from earlier tests)
let pages = await browser.pages();
let popup = pages.find(p => p.url().includes(`${EXT_ID}/popup.html`));
if (!popup) {
  console.log('no existing popup, creating new tab...');
  popup = await browser.newPage();
  // Try opening via chrome.tabs API ... not directly. Use a tab that has access.
  // Try via window.open from another extension page
  await popup.goto('chrome://newtab/');
  await new Promise(r => setTimeout(r, 1000));
  await popup.evaluate((url) => window.location.href = url, `chrome-extension://${EXT_ID}/popup.html`);
  await new Promise(r => setTimeout(r, 2000));
}

console.log('popup URL:', popup.url());
console.log('popup title:', await popup.title());

// listen for console
popup.on('console', m => console.log(`[popup ${m.type()}]`, m.text().slice(0, 200)));
popup.on('pageerror', e => console.log('[popup error]', e.message));

// Set settings via popup's chrome API
await popup.evaluate(() => Promise.all([
  new Promise(r => chrome.storage.sync.set({ settings: { mastodonInstance: 'https://mastodon.social', misskeyInstance: 'https://misskey.io', dryRun: true } }, r)),
  new Promise(r => chrome.storage.session.remove('draft', r)),
]));
console.log('settings set');

// Reload to pick up settings via popup app's getSettings()
await popup.reload();
await new Promise(r => setTimeout(r, 1500));

// Listen for [Tutti] logs from any page
const allLogs = [];
async function attachAll() {
  for (const p of await browser.pages()) {
    if (p._tutti) continue;
    p._tutti = true;
    p.on('console', (m) => {
      const t = m.text();
      if (t.includes('[Tutti]') || m.type() === 'error') {
        allLogs.push(`[${p.url().slice(0, 60)} ${m.type()}] ${t.slice(0, 250)}`);
      }
    });
  }
}
await attachAll();
browser.on('targetcreated', () => setTimeout(attachAll, 300));

// Type text + click post for Tumblr only
await popup.evaluate(() => document.querySelector('textarea').focus());
await popup.type('textarea', 'TUTTI TUMBLR TEST ' + Date.now());
await popup.evaluate(() => {
  for (const cb of Array.from(document.querySelectorAll('input[type="checkbox"]'))) {
    const want = cb.closest('label')?.textContent?.includes('Tumblr');
    if (cb.checked !== want) cb.click();
  }
});
await new Promise(r => setTimeout(r, 500));
console.log('clicking POST...');
await popup.evaluate(() => {
  const btn = Array.from(document.querySelectorAll('button')).find(b => /SNS に投稿|Post to/.test(b.textContent ?? ''));
  btn?.click();
});

await new Promise(r => setTimeout(r, 16000));
console.log('\n=== logs ===');
for (const l of allLogs) console.log(l);

await browser.disconnect();
