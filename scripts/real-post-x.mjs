// REAL post to X. Disables dryRun, posts a clearly-marked test message + image.
// Tracks: (a) modal closes after click? (b) post appears in user timeline?
import puppeteer from 'puppeteer-core';
const EXT_ID = 'dophemlpjldcejjdjefpjbgngodopkfe';
const browser = await puppeteer.connect({ browserURL: 'http://localhost:9222', protocolTimeout: 60000 });

const TEST_TEXT = `[Tutti テスト投稿] クロスポスト機能の動作確認 ${new Date().toISOString()}`;
console.log('TEST TEXT:', TEST_TEXT);

const tmpImg = 'C:\\Users\\komm64\\AppData\\Local\\Temp\\tutti-test-100x100.png';

// Listen to network for X POST createTweet calls
async function attachAll() {
  for (const p of await browser.pages()) {
    if (p._tutti) continue;
    p._tutti = true;
    p.on('console', m => {
      const t = m.text();
      if (t.includes('[Tutti]') || (m.type() === 'error' && p.url().includes('x.com'))) {
        console.log(`[${p.url().slice(0,50)} ${m.type()}]`, t.slice(0, 250));
      }
    });
    p.on('response', r => {
      const url = r.url();
      if (/CreateTweet|create_tweet|api\/.*tweet/i.test(url) && r.request().method() === 'POST') {
        console.log(`[NET ${r.status()}] ${url.slice(0, 100)}`);
      }
    });
  }
}
await attachAll();
browser.on('targetcreated', () => setTimeout(attachAll, 300));

// Open popup, set dryRun: false
const popup = await browser.newPage();
await popup.goto(`chrome-extension://${EXT_ID}/popup.html`);
await new Promise(r => setTimeout(r, 1500));
await popup.evaluate(() => Promise.all([
  new Promise(r => chrome.storage.sync.set({ settings: { mastodonInstance: 'https://mastodon.social', misskeyInstance: 'https://misskey.io', dryRun: false } }, r)),
  new Promise(r => chrome.storage.session.remove('draft', r)),
]));
await popup.reload();
await new Promise(r => setTimeout(r, 1500));

await popup.evaluate(() => document.querySelector('textarea').focus());
await popup.type('textarea', TEST_TEXT);
const fi = await popup.$('input[type="file"]');
await fi.uploadFile(tmpImg);
await new Promise(r => setTimeout(r, 1500));

// Select X only
await popup.evaluate(() => {
  const cbs = Array.from(document.querySelectorAll('input[type="checkbox"]'));
  cbs.forEach((cb, i) => { const want = i === 0; if (cb.checked !== want) cb.click(); });
});
await new Promise(r => setTimeout(r, 500));

const debugBefore = await popup.evaluate(() => ({
  text: document.querySelector('textarea')?.value?.slice(0, 60),
  buttons: Array.from(document.querySelectorAll('button')).map(b => (b.textContent ?? '').slice(0,40)).filter(Boolean),
  imageCount: document.querySelectorAll('img[src^="blob:"]').length,
}));
console.log('popup before POST:', JSON.stringify(debugBefore));

console.log('=== REAL POST CLICK ===');
await popup.evaluate(() => Array.from(document.querySelectorAll('button')).find(b => /SNS に投稿|Post to/.test(b.textContent ?? ''))?.click());

// Track X tab state for 30s
let xTab = null;
for (let i = 0; i < 30; i++) {
  await new Promise(r => setTimeout(r, 1000));
  xTab = (await browser.pages()).find(p => /x\.com|twitter\.com/.test(p.url()));
  if (!xTab) continue;
  const state = await xTab.evaluate(() => ({
    url: location.href,
    dialogCount: document.querySelectorAll('[role="dialog"]').length,
    hasModalCompose: !!document.querySelector('[role="dialog"] [data-testid="tweetTextarea_0"]'),
    blobImgs: document.querySelectorAll('img[src^="blob:"]').length,
  })).catch(() => null);
  console.log(`t+${i+1}s`, JSON.stringify(state));
  // stop when modal closed (dialog disappeared)
  if (state && !state.hasModalCompose && i > 4) break;
}

if (xTab) {
  await xTab.screenshot({ path: 'scripts/x-real-after-post.png' });

  // Navigate to user timeline and look for the test text
  console.log('\nchecking timeline for test post...');
  await xTab.goto('https://x.com/ren_fujimoto', { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 6000));
  const timelineState = await xTab.evaluate((needle) => {
    const articles = Array.from(document.querySelectorAll('article'));
    const matches = articles.filter(a => a.innerText.includes(needle));
    return {
      totalArticles: articles.length,
      hasTestPost: matches.length > 0,
      firstArticleText: articles[0]?.innerText?.slice(0, 200),
      matchTexts: matches.map(m => m.innerText.slice(0, 200)),
    };
  }, 'Tutti テスト投稿');
  console.log('timeline check:', JSON.stringify(timelineState, null, 2));
  await xTab.screenshot({ path: 'scripts/x-real-timeline.png' });
}

await browser.disconnect();
