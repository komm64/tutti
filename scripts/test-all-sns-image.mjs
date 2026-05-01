// Run dry-run image attach test through Tutti for all 6 SNS, one at a time.
// Each iteration: open popup → set settings → set image → check one platform → click POST → wait → snapshot SNS tab.
import puppeteer from 'puppeteer-core';
import { writeFileSync } from 'fs';
const EXT_ID = 'dophemlpjldcejjdjefpjbgngodopkfe';
const browser = await puppeteer.connect({ browserURL: 'http://localhost:9222' });

const tmpImg = 'C:\\Users\\komm64\\AppData\\Local\\Temp\\tutti-test-100x100.png';

const PLATFORMS = [
  { id: 'x', label: 'X', urlMatch: /(x\.com|twitter\.com)/, snapshotName: 'x' },
  { id: 'bluesky', label: 'Bluesky', urlMatch: /bsky\.app/, snapshotName: 'bluesky' },
  { id: 'threads', label: 'Threads', urlMatch: /threads\.(net|com)/, snapshotName: 'threads' },
  { id: 'mastodon', label: 'Mastodon', urlMatch: /mastodon\.social/, snapshotName: 'mastodon' },
  { id: 'misskey', label: 'Misskey', urlMatch: /misskey\.io/, snapshotName: 'misskey' },
  { id: 'tumblr', label: 'Tumblr', urlMatch: /tumblr\.com/, snapshotName: 'tumblr' },
];

const allLogs = [];
async function attachAll() {
  for (const p of await browser.pages()) {
    if (p._tutti) continue;
    p._tutti = true;
    p.on('console', m => {
      const t = m.text();
      if (t.includes('[Tutti]') || m.type() === 'error') {
        allLogs.push(`[${p.url().slice(0, 50)} ${m.type()}] ${t.slice(0, 200)}`);
      }
    });
    p.on('response', r => {
      if (!r.ok() && r.status() >= 400 && r.status() < 600 && /\/api\//.test(r.url())) {
        allLogs.push(`[NETWORK ${r.status()}] ${p.url().slice(0, 40)} → ${r.url().slice(0, 80)}`);
      }
    });
  }
}
await attachAll();
browser.on('targetcreated', () => setTimeout(attachAll, 300));

async function testOne(plat) {
  console.log(`\n=== ${plat.label} ===`);
  // Close existing tab for this SNS
  for (const p of await browser.pages()) {
    if (plat.urlMatch.test(p.url())) await p.close();
  }

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
  await popup.type('textarea', `IMG TEST ${plat.label} ${Date.now()}`);
  const fi = await popup.$('input[type="file"]');
  await fi.uploadFile(tmpImg);
  await new Promise(r => setTimeout(r, 1200));

  // Select only this platform
  await popup.evaluate((wantLabel) => {
    for (const cb of Array.from(document.querySelectorAll('input[type="checkbox"]'))) {
      const txt = cb.closest('label')?.textContent ?? '';
      const want = txt.includes(wantLabel);
      if (cb.checked !== want) cb.click();
    }
  }, plat.label);
  await new Promise(r => setTimeout(r, 400));

  await popup.evaluate(() => Array.from(document.querySelectorAll('button')).find(b => /SNS に投稿|Post to/.test(b.textContent ?? ''))?.click());

  // Wait up to 15s for SNS tab and inject result
  let tab = null;
  for (let i = 0; i < 18; i++) {
    await new Promise(r => setTimeout(r, 1000));
    tab = (await browser.pages()).find(p => plat.urlMatch.test(p.url()));
    if (tab) break;
  }
  if (!tab) { console.log(`  no ${plat.label} tab opened`); await popup.close(); return; }
  await new Promise(r => setTimeout(r, 6000)); // let inject + thumbnail render

  // Probe DOM for evidence of image preview
  const probe = await tab.evaluate(() => {
    const fis = Array.from(document.querySelectorAll('input[type="file"]'));
    return {
      url: location.href,
      fileInputCount: fis.length,
      fileCounts: fis.map(f => f.files?.length ?? 0),
      // generic indicators of an attached image preview
      hasImg: !!document.querySelector('img[src^="blob:"], img[src^="data:image"]'),
      // bodyText hints
      bodyHasEdit: /Edit/i.test(document.body.innerText),
      bodyHasRemove: /Remove|削除|✕|×/.test(document.body.innerText),
    };
  });
  console.log(`  ${plat.label} probe:`, JSON.stringify(probe));
  await tab.screenshot({ path: `scripts/all-sns-${plat.snapshotName}.png` });
  await popup.close();
}

for (const p of PLATFORMS) await testOne(p);

console.log('\n=== relevant logs ===');
for (const l of allLogs.slice(-50)) console.log(l);
await browser.disconnect();
