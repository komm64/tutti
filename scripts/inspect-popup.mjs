import puppeteer from 'puppeteer-core';
const browser = await puppeteer.connect({ browserURL: 'http://localhost:9222' });

// Get extension ID from getExtensionsInfo
const tabs = await browser.pages();
const anyPage = tabs[0];
const extId = await anyPage.evaluate(async () => {
  return new Promise(r => chrome?.developerPrivate?.getExtensionsInfo({}, items => r(items?.[0]?.id ?? null)));
}).catch(() => null);
// Fallback: get from targets
let extensionId = extId;
if (!extensionId) {
  const targets = await browser.targets();
  for (const t of targets) {
    const m = t.url().match(/^chrome-extension:\/\/([a-z]+)\//);
    if (m) { extensionId = m[1]; break; }
  }
}
// Hardcode if still unknown
if (!extensionId) extensionId = 'dophemlpjldcejjdjefpjbgngodopkfe';
console.log('extension ID:', extensionId);

// Visit each SNS to make content script detect login
console.log('\nvisiting SNSs to populate lastSeenUsers...');
const sns = [
  ['https://bsky.app/', 'bluesky'],
  ['https://www.tumblr.com/dashboard', 'tumblr'],
  ['https://mastodon.social/home', 'mastodon'],
  ['https://misskey.io/', 'misskey'],
  ['https://www.threads.com/', 'threads'],
  ['https://x.com/home', 'x'],
];
const results = {};
for (const [url, key] of sns) {
  const page = await browser.newPage();
  const logs = [];
  page.on('console', m => { const t = m.text(); if (t.includes('[Tutti]')) logs.push(t); });
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    console.log(` ${key}: URL=${page.url()} title=${(await page.title()).slice(0, 50)}`);
    await new Promise(r => setTimeout(r, 12000));
    const succLog = logs.find(l => l.includes('detection succeeded'));
    results[key] = succLog ? succLog : `(no detection: ${logs.length} logs, last="${logs[logs.length - 1]?.slice(0, 80)}")`;
  } catch (e) {
    results[key] = `ERROR: ${e.message}`;
  }
  await page.close();
}
console.log('\nDetection results:');
for (const [k, v] of Object.entries(results)) console.log(`  ${k}: ${v.slice(0, 200)}`);

// Open popup page
console.log('\nopening Tutti popup...');
const popupPage = await browser.newPage();
popupPage.on('console', m => console.log(`[popup ${m.type()}] ${m.text().slice(0, 200)}`));
popupPage.on('pageerror', e => console.log('[popup error]', e.message));
await popupPage.goto(`chrome-extension://${extensionId}/popup.html`, { waitUntil: 'domcontentloaded' });
await new Promise(r => setTimeout(r, 2000));

const popupState = await popupPage.evaluate(async () => {
  const lastSeen = await new Promise(r => browser.storage.local.get('lastSeenUsers', d => r(d.lastSeenUsers)));
  const settings = await new Promise(r => browser.storage.sync.get('settings', d => r(d.settings)));
  return {
    title: document.title,
    bodyTextSnippet: document.body.innerText.slice(0, 500),
    lastSeen,
    settings,
  };
});
console.log('\npopup state:');
console.log(JSON.stringify(popupState, null, 2));

await browser.disconnect();
