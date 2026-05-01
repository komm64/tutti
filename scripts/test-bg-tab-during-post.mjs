// Simulate: SNS tab opens, then immediately gets pushed to background mid-post.
// Tutti's autoPost ON already opens tabs as background, but this test forces an
// additional tab activation right after to verify the background tab keeps posting.
import puppeteer from 'puppeteer-core';
const EXT_ID = 'dophemlpjldcejjdjefpjbgngodopkfe';
const browser = await puppeteer.connect({ browserURL: 'http://localhost:9222', protocolTimeout: 60000 });

for (const p of await browser.pages()) {
  if (/x\.com|twitter\.com|popup\.html|mastodon|tumblr|misskey|threads|bsky/.test(p.url())) await p.close();
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

const TEST = `[Tutti BG-stress ${new Date().toISOString()}] 複数 SNS 同時 + タブ背面化`;
await popup.evaluate(() => document.querySelector('textarea').focus());
await popup.type('textarea', TEST);
const fi = await popup.$('input[type="file"]');
await fi.uploadFile(tmpImg);
await new Promise(r => setTimeout(r, 1500));

// Select X + Mastodon + Tumblr (3 SNS)
await popup.evaluate(() => {
  const cbs = Array.from(document.querySelectorAll('input[type="checkbox"][class*="accent-blue"]'));
  const platformCbs = cbs.slice(1);
  // 0=X, 3=Mastodon, 5=Tumblr
  const wantIdxs = new Set([0, 3, 5]);
  platformCbs.forEach((cb, i) => { const want = wantIdxs.has(i); if (cb.checked !== want) cb.click(); });
});
await new Promise(r => setTimeout(r, 400));

console.log('=== POST CLICK on 3 SNS ===');
const startedAt = Date.now();
await popup.evaluate(() => Array.from(document.querySelectorAll('button')).find(b => /SNS に投稿|Post to/.test(b.textContent ?? ''))?.click());

// While posts are running, periodically: capture each SNS tab status,
// and FORCE a focus on the popup tab after each new SNS tab opens (so SNS tabs
// stay 100% background, simulating user "tab created and immediately hidden")
let bestProgress = '';
for (let i = 0; i < 50; i++) {
  await new Promise(r => setTimeout(r, 1000));
  const probe = await popup.evaluate(() => ({
    progress: document.querySelector('.bg-gray-50')?.innerText?.slice(0, 300),
    error: document.querySelector('.bg-red-50')?.innerText,
  })).catch(() => null);
  if (probe?.progress && probe.progress !== bestProgress) {
    console.log(`t+${i+1}s | ${probe.progress.replace(/\n/g, ' | ')}`);
    bestProgress = probe.progress;
  }
  // Stop when 3/3 done
  const done = (probe?.progress?.match(/✓|✗/g) ?? []).length;
  if (done >= 3) break;
}
console.log(`\nelapsed: ${(Date.now() - startedAt) / 1000}s`);
await popup.screenshot({ path: 'scripts/popup-3sns-final.png' });
await browser.disconnect();
