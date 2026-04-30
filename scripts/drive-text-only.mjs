import puppeteer from 'puppeteer-core';

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
        allLogs.push(`[${p.url().slice(0, 60)} ${m.type()}] ${t.slice(0, 250)}`);
      }
    });
  }
}
await attachAll();
browser.on('targetcreated', () => setTimeout(attachAll, 300));

async function testTextOnly(label) {
  console.log(`\n=== ${label} (text-only) ===`);
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

  await popup.evaluate(() => document.querySelector('textarea').focus());
  await popup.type('textarea', `Tutti text only ${Date.now()}`);
  await popup.evaluate((label) => {
    for (const cb of Array.from(document.querySelectorAll('input[type="checkbox"]'))) {
      const want = cb.closest('label')?.textContent?.includes(label);
      if (cb.checked !== want) cb.click();
    }
  }, label);
  await new Promise(r => setTimeout(r, 400));
  await popup.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => /SNS に投稿|Post to/.test(b.textContent ?? ''));
    btn?.click();
  });
  await new Promise(r => setTimeout(r, 14000));

  const success = allLogs.find(l => l.includes('dry-run: post button found'));
  console.log(`  dry-run reached: ${!!success}`);
  if (!success) {
    console.log('  logs:');
    for (const l of allLogs) console.log('   ', l.slice(0, 200));
  }
  await popup.close();
}

for (const p of ['Misskey', 'Tumblr', 'Bluesky']) {
  await testTextOnly(p);
}

await browser.disconnect();
