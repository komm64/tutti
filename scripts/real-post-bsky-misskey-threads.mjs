// Real auto-post test for Bluesky / Misskey / Threads with image.
import puppeteer from 'puppeteer-core';
const EXT_ID = 'dophemlpjldcejjdjefpjbgngodopkfe';
const browser = await puppeteer.connect({ browserURL: 'http://localhost:9222', protocolTimeout: 60000 });

const tmpImg = 'C:\\Users\\komm64\\AppData\\Local\\Temp\\tutti-test-100x100.png';

const allLogs = [];
async function attachAll() {
  for (const p of await browser.pages()) {
    if (p._tutti) continue;
    p._tutti = true;
    p.on('console', m => {
      const t = m.text();
      if (t.includes('[Tutti]') || (m.type() === 'error' && !t.includes('chrome-extension'))) {
        allLogs.push(`[${p.url().slice(0, 50)} ${m.type()}] ${t.slice(0, 250)}`);
      }
    });
  }
}
await attachAll();
browser.on('targetcreated', () => setTimeout(attachAll, 300));

async function postOne(label, idx, urlMatch) {
  console.log(`\n========= ${label} =========`);
  for (const p of await browser.pages()) {
    if (urlMatch.test(p.url())) await p.close();
  }
  for (const p of await browser.pages()) {
    if (p.url().includes('popup.html')) await p.close();
  }
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

  const text = `[Tutti自動投稿 ${label}] ${new Date().toISOString()}`;
  await popup.evaluate(() => document.querySelector('textarea').focus());
  await popup.type('textarea', text);
  const fi = await popup.$('input[type="file"]');
  await fi.uploadFile(tmpImg);
  await new Promise(r => setTimeout(r, 1500));
  await popup.evaluate((idx) => {
    const cbs = Array.from(document.querySelectorAll('input[type="checkbox"][class*="accent-blue"]'));
    const platformCbs = cbs.slice(1);
    platformCbs.forEach((cb, i) => { const want = i === idx; if (cb.checked !== want) cb.click(); });
  }, idx);
  await new Promise(r => setTimeout(r, 400));

  const logsBefore = allLogs.length;
  await popup.evaluate(() => Array.from(document.querySelectorAll('button')).find(b => /SNS に投稿|Post to/.test(b.textContent ?? ''))?.click());

  // Wait for completion (max 30s)
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 1000));
    const probe = await popup.evaluate(() => ({
      progress: document.querySelector('.bg-gray-50')?.innerText?.slice(0, 200),
      error: document.querySelector('.bg-red-50')?.innerText,
    })).catch(() => null);
    if (probe?.progress?.includes('✓') || probe?.progress?.includes('✗') || probe?.error) {
      console.log(`t+${i+1}s | ${probe.progress?.replace(/\n/g, ' | ') || probe.error}`);
      break;
    }
  }

  const newLogs = allLogs.slice(logsBefore);
  console.log(`-- ${label} logs (${newLogs.length}) --`);
  for (const l of newLogs.slice(-10)) console.log(l);

  // screenshot SNS tab final state
  const tab = (await browser.pages()).find(p => urlMatch.test(p.url()));
  if (tab) await tab.screenshot({ path: `C:/Users/komm64/Projects/tutti/scripts/realpost2-${label.toLowerCase()}.png` });
  await popup.close();
}

await postOne('Bluesky', 1, /bsky\.app/);
await postOne('Threads', 2, /threads\.(com|net)/);
await postOne('Misskey', 4, /misskey\.io/);

await browser.disconnect();
