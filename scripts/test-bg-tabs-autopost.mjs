// Verify autoPost ON: SNS tabs open as background (active: false), all 6 SNS posts succeed.
// Also verify popup stays alive throughout (popup.evaluate keeps working).
import puppeteer from 'puppeteer-core';
const EXT_ID = 'dophemlpjldcejjdjefpjbgngodopkfe';
const browser = await puppeteer.connect({ browserURL: 'http://localhost:9222', protocolTimeout: 60000 });

for (const p of await browser.pages()) {
  if (/x\.com|twitter\.com|popup\.html/.test(p.url())) await p.close();
}

const tmpImg = 'C:\\Users\\komm64\\AppData\\Local\\Temp\\tutti-test-100x100.png';

const popup = await browser.newPage();
await popup.goto(`chrome-extension://${EXT_ID}/popup.html`);
await new Promise(r => setTimeout(r, 1500));
await popup.evaluate(() => Promise.all([
  new Promise(r => chrome.storage.sync.set({ settings: { mastodonInstance: 'https://mastodon.social', misskeyInstance: 'https://misskey.io', autoPost: true } }, r)),
  new Promise(r => chrome.storage.session.remove('draft', r)),
  new Promise(r => chrome.storage.local.remove('selectedPlatforms', r)),
]));
await popup.reload();
await new Promise(r => setTimeout(r, 1500));

const TEST = `[Tutti BG-tabs ${new Date().toISOString()}] バックグラウンドタブで投稿`;
await popup.evaluate(() => document.querySelector('textarea').focus());
await popup.type('textarea', TEST);
const fi = await popup.$('input[type="file"]');
await fi.uploadFile(tmpImg);
await new Promise(r => setTimeout(r, 1500));

// select X only
await popup.evaluate(() => {
  const cbs = Array.from(document.querySelectorAll('input[type="checkbox"][class*="accent-blue"]'));
  const platformCbs = cbs.slice(1);
  platformCbs.forEach((cb, i) => { const want = i === 0; if (cb.checked !== want) cb.click(); });
});
await new Promise(r => setTimeout(r, 400));

// Get the active tab id BEFORE posting
const beforeActive = await popup.evaluate(() => new Promise(r =>
  chrome.tabs.query({ active: true, currentWindow: true }, t => r(t[0]?.url ?? null))
));
console.log('active tab BEFORE post:', beforeActive);

console.log('=== POST CLICK ===');
await popup.evaluate(() => Array.from(document.querySelectorAll('button')).find(b => /SNS に投稿|Post to/.test(b.textContent ?? ''))?.click());

// Poll popup state for 25s. Verify popup is responsive (= didn't close in user's view)
const samples = [];
for (let i = 0; i < 25; i++) {
  await new Promise(r => setTimeout(r, 1000));
  const probe = await popup.evaluate(() => ({
    progressText: document.querySelector('.bg-gray-50')?.innerText?.slice(0, 200),
    activeTab: null,
  })).catch(() => null);
  const activeTabUrl = await popup.evaluate(() => new Promise(r =>
    chrome.tabs.query({ active: true, currentWindow: true }, t => r(t[0]?.url ?? null))
  )).catch(() => null);
  samples.push({ t: i + 1, probe, activeTabUrl });
  if (probe?.progressText?.includes('✓') || probe?.progressText?.includes('✗')) {
    // capture a couple more samples after completion
    if (samples.filter(s => s.probe?.progressText?.includes('✓')).length > 1) break;
  }
}
for (const s of samples) {
  if (s.probe?.progressText) console.log(`t+${s.t}s active:${s.activeTabUrl?.slice(0, 50)} | ${s.probe.progressText?.replace(/\n/g, ' | ')}`);
}

await popup.screenshot({ path: 'scripts/popup-progress.png' });

await browser.disconnect();
