// Real post (autoPost=true) verification for Pixiv.
// 投稿が実際にサーバ送信されて公開されるかを確認する。test アカウント前提。
import puppeteer from 'puppeteer-core';
import { writeFileSync, appendFileSync, readFileSync } from 'fs';

const LOG = 'scripts/realpost-pixiv.log';
writeFileSync(LOG, `=== ${new Date().toISOString()} ===\n`);
const log = (...a) => {
  const line = a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x, null, 2))).join(' ');
  appendFileSync(LOG, line + '\n');
  process.stdout.write(line + '\n');
};
process.on('uncaughtException', (e) => { log('UNCAUGHT', e.message); process.exit(1); });

const EXT_ID = 'dophemlpjldcejjdjefpjbgngodopkfe';
log('connecting to brave on 9222...');
const browser = await puppeteer.connect({ browserURL: 'http://localhost:9222', protocolTimeout: 240000 });
log('connected');

async function attachAll() {
  for (const p of await browser.pages()) {
    if (p._tutti) continue;
    p._tutti = true;
    p.on('console', (m) => {
      const t = m.text();
      if (/\[Tutti/i.test(t) || m.type() === 'error') {
        log(`[${p.url().slice(0, 60)} ${m.type()}]`, t.slice(0, 250));
      }
    });
  }
}
await attachAll();
browser.on('targetcreated', () => setTimeout(attachAll, 300));

const png = readFileSync('scripts/all-sns-mastodon.png');
const tmpImg = 'C:\\Users\\komm64\\AppData\\Local\\Temp\\tutti-realpost-pixiv.png';
writeFileSync(tmpImg, png);

log('opening popup...');
const popup = await browser.newPage();
await popup.goto(`chrome-extension://${EXT_ID}/popup.html`, { waitUntil: 'domcontentloaded' });
await new Promise((r) => setTimeout(r, 1500));

log('configuring popup (autoPost=true, only Pixiv selected)...');
await popup.evaluate(() => Promise.all([
  new Promise((r) => chrome.storage.sync.set({ settings: { autoPost: true } }, r)),
  new Promise((r) => chrome.storage.session.remove('draft', r)),
  new Promise((r) => chrome.storage.local.set({ selectedPlatforms: { pixiv: true, x: false, bluesky: false, threads: false, mastodon: false, misskey: false, tumblr: false, deviantart: false, instagram: false } }, r)),
]));
await popup.reload({ waitUntil: 'domcontentloaded' });
await new Promise((r) => setTimeout(r, 1500));

const ts = Date.now().toString().slice(-6);
const testText = `Tutti realpost test ${ts}\nThis is the body line.`;
log(`text: "${testText.slice(0, 50)}..."`);
await popup.evaluate(() => document.querySelector('textarea').focus());
await popup.type('textarea', testText);
const fi = await popup.$('input[type="file"]');
await fi.uploadFile(tmpImg);
await new Promise((r) => setTimeout(r, 1500));

await popup.evaluate(() => {
  for (const cb of Array.from(document.querySelectorAll('input[type="checkbox"]'))) {
    const label = cb.closest('label');
    const isPixiv = /Pixiv/i.test(label?.textContent ?? '');
    if (cb.checked !== isPixiv) cb.click();
  }
});
await new Promise((r) => setTimeout(r, 600));

// 既存 Pixiv タブ closing
const beforeTabs = await browser.pages();
for (const p of beforeTabs) {
  if (/pixiv\.net/.test(p.url()) && p !== popup) {
    try { await p.close(); } catch {}
  }
}

log('clicking Post button (autoPost=true → real submission)...');
await popup.evaluate(() => {
  const btn = Array.from(document.querySelectorAll('button')).find((b) =>
    /SNS に投稿|SNS をプレビュー|Post to|Preview on/i.test(b.textContent ?? ''),
  );
  if (!btn) throw new Error('post button not found in popup');
  btn.click();
});

log('\n=== watching Pixiv ===');
let pix = null;
for (let i = 0; i < 60; i++) {
  await new Promise((r) => setTimeout(r, 1000));
  const all = await browser.pages();
  pix = all.find((p) => /pixiv\.net/.test(p.url()) && p !== popup);
  if (!pix) {
    if (i % 5 === 0) log(`t+${i}s waiting...`);
    continue;
  }
  let state;
  try {
    state = await pix.evaluate(() => ({
      url: location.href,
      title: document.title.slice(0, 60),
      // 投稿成功時は /artworks/<id> や /upload/result 等に遷移するはず
      // または成功 toast / modal が出る
      successHints: {
        urlIsArtwork: /\/artworks\/\d+/.test(location.href),
        urlIsUpload: /\/upload/.test(location.href),
        urlIsCreate: /\/illustration\/create|\/manga\/create/.test(location.href),
        toastText: Array.from(document.querySelectorAll('[role="status"], [role="alert"], .toast'))
          .map((el) => (el.textContent ?? '').trim().slice(0, 80))
          .filter((t) => t.length > 0),
        bodyTextSnippet: document.body?.textContent?.slice(0, 50) ?? '',
      },
    }));
  } catch (e) {
    log(`t+${i}s eval failed: ${e.message?.slice(0, 100)}`);
    continue;
  }
  log(`t+${i}s ${JSON.stringify(state)}`);
  if (state.successHints.urlIsArtwork) {
    log('  → 🎉 Pixiv post success (URL changed to /artworks/...)');
    break;
  }
}
// 最終 popup result も確認
const popupResult = await popup.evaluate(() => {
  const errEl = document.querySelector('.text-rose-700, [role="alert"]');
  const resultEl = document.querySelector('[class*="result"], [class*="status"]');
  return {
    errText: errEl?.textContent?.trim().slice(0, 200) ?? null,
    resultText: resultEl?.textContent?.trim().slice(0, 200) ?? null,
  };
}).catch(() => null);
log('popup state:', popupResult);

if (pix) await pix.screenshot({ path: 'scripts/realpost-pixiv.png', fullPage: false });
log('done');
await browser.disconnect();
