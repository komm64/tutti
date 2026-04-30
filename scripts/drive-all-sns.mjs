// Drive each SNS via popup with dry-run, capture per-SNS result.
import puppeteer from 'puppeteer-core';
import { writeFileSync } from 'fs';

const EXT_ID = 'dophemlpjldcejjdjefpjbgngodopkfe';
const browser = await puppeteer.connect({ browserURL: 'http://localhost:9222' });

const allLogs = [];
async function attachAll() {
  for (const p of await browser.pages()) {
    if (p._tutti) continue;
    p._tutti = true;
    p.on('console', (m) => {
      const t = m.text();
      if (t.includes('[Tutti]') || m.type() === 'error') {
        allLogs.push({ url: p.url().slice(0, 70), type: m.type(), text: t.slice(0, 250) });
      }
    });
  }
}
await attachAll();
browser.on('targetcreated', () => setTimeout(attachAll, 300));

const png = Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,0,0,0,0x0d,0x49,0x48,0x44,0x52,0,0,0,1,0,0,0,1,8,6,0,0,0,0x1f,0x15,0xc4,0x89,0,0,0,0x0d,0x49,0x44,0x41,0x54,0x78,0x9c,0x63,0xfc,0xcf,0xc0,0,0,0,3,0,1,0x46,0x4d,0x44,0x41,0,0,0,0,0x49,0x45,0x4e,0x44,0xae,0x42,0x60,0x82]);
const tmpImg = 'C:\\Users\\komm64\\AppData\\Local\\Temp\\tutti-test-image.png';
writeFileSync(tmpImg, png);

async function testOne(platformLabel) {
  console.log(`\n========== Testing ${platformLabel} ==========`);
  allLogs.length = 0;

  const popup = await browser.newPage();
  await popup.goto(`chrome-extension://${EXT_ID}/popup.html`);
  await new Promise(r => setTimeout(r, 1000));
  await popup.evaluate(() => Promise.all([
    new Promise(r => chrome.storage.sync.set({ settings: { mastodonInstance: 'https://mastodon.social', misskeyInstance: 'https://misskey.io', dryRun: true } }, r)),
    new Promise(r => chrome.storage.session.remove('draft', r)),
  ]));
  await popup.reload();
  await new Promise(r => setTimeout(r, 1500));
  await attachAll();

  await popup.evaluate(() => { document.querySelector('textarea').focus(); });
  await popup.type('textarea', `TUTTI ${platformLabel} ${Date.now()}`);
  const fi = await popup.$('input[type="file"]');
  await fi.uploadFile(tmpImg);
  await new Promise(r => setTimeout(r, 1500));
  await popup.evaluate((label) => {
    for (const cb of Array.from(document.querySelectorAll('input[type="checkbox"]'))) {
      const want = cb.closest('label')?.textContent?.includes(label);
      if (cb.checked !== want) cb.click();
    }
  }, platformLabel);
  await new Promise(r => setTimeout(r, 400));
  await popup.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => /SNS に投稿|Post to/.test(b.textContent ?? ''));
    btn?.click();
  });

  await new Promise(r => setTimeout(r, 16000));

  // Categorize logs
  const success = allLogs.find(l => l.text.includes('dry-run: post button found'));
  const errors = allLogs.filter(l => l.text.includes('全戦略失敗') || l.type === 'pageerror' || l.text.includes('throw') || l.text.includes('Error'));
  const detection = allLogs.find(l => l.text.includes('detection succeeded'));
  const ready = allLogs.find(l => l.text.includes('content script ready'));

  console.log(`  ready: ${!!ready}`);
  console.log(`  detection: ${detection ? detection.text.slice(0, 80) : '(none)'}`);
  console.log(`  dry-run reached: ${!!success}`);
  if (!success) {
    console.log(`  full logs (${allLogs.length}):`);
    for (const l of allLogs) console.log(`    [${l.type}]`, l.text.slice(0, 200));
  }

  await popup.close();
}

for (const p of ['Mastodon', 'Misskey', 'Tumblr', 'Threads', 'X']) {
  await testOne(p);
}

await browser.disconnect();
