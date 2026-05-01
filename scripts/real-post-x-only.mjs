// Real auto-post to X only. Verify text body appears in the actual posted tweet.
import puppeteer from 'puppeteer-core';
const EXT_ID = 'dophemlpjldcejjdjefpjbgngodopkfe';
const browser = await puppeteer.connect({ browserURL: 'http://localhost:9222', protocolTimeout: 60000 });

for (const p of await browser.pages()) {
  if (/x\.com|twitter\.com|popup\.html/.test(p.url())) await p.close();
}

const TEST_TEXT = `[Tutti X本文テスト ${new Date().toISOString()}] 本文が反映されてるはず`;
console.log('TEST TEXT:', TEST_TEXT);

const tmpImg = 'C:\\Users\\komm64\\AppData\\Local\\Temp\\tutti-test-100x100.png';

const allLogs = [];
async function attachAll() {
  for (const p of await browser.pages()) {
    if (p._tutti) continue;
    p._tutti = true;
    p.on('console', m => {
      const t = m.text();
      if (t.includes('[Tutti]') || (m.type() === 'error' && p.url().includes('x.com'))) {
        allLogs.push(`[${p.url().slice(0, 50)} ${m.type()}] ${t.slice(0, 250)}`);
      }
    });
  }
}
await attachAll();
browser.on('targetcreated', () => setTimeout(attachAll, 300));

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
await popup.evaluate(() => document.querySelector('textarea').focus());
await popup.type('textarea', TEST_TEXT);
const fi = await popup.$('input[type="file"]');
await fi.uploadFile(tmpImg);
await new Promise(r => setTimeout(r, 1500));
await popup.evaluate(() => {
  const cbs = Array.from(document.querySelectorAll('input[type="checkbox"][class*="accent-blue"]'));
  // first cb is autoPost, then platform cbs starting at 1
  const platformCbs = cbs.slice(1);
  platformCbs.forEach((cb, i) => { const want = i === 0; if (cb.checked !== want) cb.click(); });
});
await new Promise(r => setTimeout(r, 400));

console.log('=== POST CLICK ===');
await popup.evaluate(() => Array.from(document.querySelectorAll('button')).find(b => /SNS に投稿|Post to/.test(b.textContent ?? ''))?.click());

// Wait for X tab to actually post
let xTab = null;
for (let i = 0; i < 25; i++) {
  await new Promise(r => setTimeout(r, 1000));
  xTab = (await browser.pages()).find(p => /x\.com|twitter\.com/.test(p.url()));
  if (!xTab) continue;
}

// wait extra for X timeline to update
await new Promise(r => setTimeout(r, 5000));

console.log('\nLOGS:');
for (const l of allLogs) console.log(l);

// Navigate to user profile and check actual post text
if (xTab) {
  await xTab.goto('https://x.com/ren_fujimoto', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await new Promise(r => setTimeout(r, 6000));
  await xTab.evaluate(() => window.scrollTo(0, 600));
  await new Promise(r => setTimeout(r, 2000));
  const posts = await xTab.evaluate(() => {
    return Array.from(document.querySelectorAll('article')).slice(0, 3).map(a => ({
      text: a.querySelector('[data-testid="tweetText"]')?.innerText ?? '(no tweet text)',
      hasImg: !!a.querySelector('img[alt][src*="media"], img[src*="pbs.twimg.com/media"]'),
      fullText: a.innerText.slice(0, 300),
    }));
  });
  console.log('\nposts on timeline:');
  console.log(JSON.stringify(posts, null, 2));
  await xTab.screenshot({ path: 'scripts/x-post-with-text.png' });
}
await browser.disconnect();
