// Real auto-post test to X / Mastodon / Tumblr with image, one at a time.
// Captures: per-SNS console errors + network failures + final timeline state.
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
    p.on('pageerror', e => allLogs.push(`[${p.url().slice(0,50)} pageerror] ${e.message.slice(0,200)}`));
    p.on('response', r => {
      const url = r.url();
      const m = r.request().method();
      if (m !== 'GET' && m !== 'OPTIONS' && !r.ok() && !url.includes('events.bsky')) {
        allLogs.push(`[NET ${r.status()} ${m}] ${url.slice(0, 100)}`);
      }
    });
  }
}
await attachAll();
browser.on('targetcreated', () => setTimeout(attachAll, 300));

async function postToOne(label, idx, urlMatch) {
  console.log(`\n========= ${label} =========`);
  for (const p of await browser.pages()) {
    if (urlMatch.test(p.url())) await p.close();
  }
  const popup = await browser.newPage();
  await popup.goto(`chrome-extension://${EXT_ID}/popup.html`);
  await new Promise(r => setTimeout(r, 1500));
  // autoPost: true (real post), single platform
  await popup.evaluate(() => Promise.all([
    new Promise(r => chrome.storage.sync.set({ settings: { mastodonInstance: 'https://mastodon.social', misskeyInstance: 'https://misskey.io', autoPost: true } }, r)),
    new Promise(r => chrome.storage.session.remove('draft', r)),
    new Promise(r => chrome.storage.local.remove('selectedPlatforms', r)),
  ]));
  await popup.reload();
  await new Promise(r => setTimeout(r, 1500));

  const text = `[Tutti自動投稿テスト ${label}] ${new Date().toISOString()}`;
  await popup.evaluate(() => document.querySelector('textarea').focus());
  await popup.type('textarea', text);
  const fi = await popup.$('input[type="file"]');
  await fi.uploadFile(tmpImg);
  await new Promise(r => setTimeout(r, 1500));

  await popup.evaluate((idx) => {
    const cbs = Array.from(document.querySelectorAll('input[type="checkbox"][class*="accent-blue"]'));
    // first checkbox is autoPost toggle, then platform checkboxes
    const platformCbs = cbs.slice(1);
    platformCbs.forEach((cb, i) => { const want = i === idx; if (cb.checked !== want) cb.click(); });
  }, idx);
  await new Promise(r => setTimeout(r, 400));

  const before = await popup.evaluate(() => ({
    text: document.querySelector('textarea')?.value?.slice(0, 60),
    buttons: Array.from(document.querySelectorAll('button')).map(b => (b.textContent ?? '').slice(0, 50)).filter(Boolean).slice(0, 8),
  }));
  console.log('popup before POST:', JSON.stringify(before));

  const logsBefore = allLogs.length;

  const clickResult = await popup.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => /SNS に投稿|Post to/.test(b.textContent ?? ''));
    if (!btn) return { error: 'no post button' };
    btn.click();
    return { ok: true, btnText: btn.textContent };
  });
  console.log('clicked:', clickResult);

  // wait up to 30s for completion
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 1000));
    const state = await popup.evaluate(() => ({
      done: !document.querySelector('button[disabled]')?.textContent?.includes('投稿中') && !document.querySelector('button[disabled]')?.textContent?.includes('Posting'),
      results: Array.from(document.querySelectorAll('li')).map(l => l.innerText.slice(0, 100)).filter(t => t.length > 0).slice(0, 5),
      errorMsg: document.querySelector('.bg-red-50')?.textContent,
    })).catch(() => null);
    if (state?.results?.length || state?.errorMsg) {
      console.log(`t+${i+1}s`, JSON.stringify(state));
    }
    if (state?.errorMsg || state?.results?.some(r => r.includes('✓') || r.includes('✗'))) break;
  }

  const newLogs = allLogs.slice(logsBefore);
  console.log(`-- ${label} relevant logs (${newLogs.length}) --`);
  for (const l of newLogs) console.log(l);

  // screenshot final SNS tab state
  const tab = (await browser.pages()).find(p => urlMatch.test(p.url()));
  if (tab) await tab.screenshot({ path: `C:/Users/komm64/Projects/tutti/scripts/realpost-${label.toLowerCase()}.png` });
  await popup.close();
}

await postToOne('X', 0, /x\.com|twitter\.com/);
await postToOne('Mastodon', 3, /mastodon\.social/);
await postToOne('Tumblr', 5, /tumblr\.com/);

await browser.disconnect();
