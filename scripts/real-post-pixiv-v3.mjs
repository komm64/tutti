// browser.pages() が詰まる Brave 問題を回避するため targets() を使う driver。
// targets() の戻り値から Page を target.page() で取り、それで操作する。
import puppeteer from 'puppeteer-core';
import { writeFileSync, appendFileSync, readFileSync } from 'fs';

const LOG = 'scripts/realpost-pixiv-v3.log';
writeFileSync(LOG, `=== ${new Date().toISOString()} ===\n`);
const log = (...a) => {
  const line = a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' ');
  appendFileSync(LOG, line + '\n');
  process.stdout.write(line + '\n');
};
process.on('uncaughtException', (e) => { log('UNCAUGHT', e.message?.slice(0, 200)); process.exit(1); });

const EXT_ID = 'dophemlpjldcejjdjefpjbgngodopkfe';
log('connecting...');
const browser = await puppeteer.connect({ browserURL: 'http://localhost:9222', protocolTimeout: 240000 });
log('connected');

// targets() use (pages() を回避)
const targets = browser.targets();
log(`targets: ${targets.length}`);
for (const t of targets) {
  const url = t.url();
  if (url.length > 5 && t.type() === 'page') log(` page: ${url.slice(0, 100)}`);
}

// pixiv create を持つ target を探す
const pixTarget = targets.find((t) => t.type() === 'page' && /pixiv\.net\/illustration\/create/.test(t.url()));
if (!pixTarget) {
  log('no pixiv target. abort.');
  process.exit(1);
}
log('getting pixiv page handle...');
const pixPage = await pixTarget.page();
if (!pixPage) {
  log('pixTarget.page() returned null');
  process.exit(1);
}
log('pixiv page handle obtained');
pixPage.on('console', (m) => {
  const t = m.text();
  if (/\[Tutti/i.test(t) || m.type() === 'error' || m.type() === 'warn') {
    log(`[pixiv ${m.type()}]`, t.slice(0, 250));
  }
});

// extensions tab を popup として使う
const extTarget = targets.find((t) => t.type() === 'page' && /chrome:\/\/extensions/.test(t.url()));
if (!extTarget) {
  log('no extensions tab. open chrome://extensions/ first.');
  process.exit(1);
}
const extPage = await extTarget.page();
log('extensions tab handle obtained');

log('navigating extensions tab to popup');
await extPage.goto(`chrome-extension://${EXT_ID}/popup.html`, { waitUntil: 'domcontentloaded', timeout: 30000 });
log('popup loaded');
extPage.on('console', (m) => {
  if (/\[Tutti/i.test(m.text()) || m.type() === 'error') log(`[popup ${m.type()}]`, m.text().slice(0, 250));
});

log('configuring storage');
await extPage.evaluate(() => Promise.all([
  new Promise((r) => chrome.storage.sync.set({ settings: { autoPost: true } }, r)),
  new Promise((r) => chrome.storage.session.remove('draft', r)),
  new Promise((r) => chrome.storage.local.set({ selectedPlatforms: { pixiv: true, x: false, bluesky: false, threads: false, mastodon: false, misskey: false, tumblr: false, deviantart: false, instagram: false } }, r)),
]));
await extPage.reload({ waitUntil: 'domcontentloaded' });
await new Promise((r) => setTimeout(r, 1500));

const png = readFileSync('scripts/all-sns-mastodon.png');
const tmpImg = 'C:\\Users\\komm64\\AppData\\Local\\Temp\\tutti-realpost-v3.png';
writeFileSync(tmpImg, png);

const ts = Date.now().toString().slice(-6);
const testText = `Tutti realpost ${ts}\n本文 line 2.`;
log(`text="${testText.slice(0, 40)}"`);
await extPage.evaluate(() => document.querySelector('textarea').focus());
await extPage.type('textarea', testText);
const fi = await extPage.$('input[type="file"]');
await fi.uploadFile(tmpImg);
await new Promise((r) => setTimeout(r, 1500));

await extPage.evaluate(() => {
  for (const cb of Array.from(document.querySelectorAll('input[type="checkbox"]'))) {
    const isPixiv = /Pixiv/i.test(cb.closest('label')?.textContent ?? '');
    if (cb.checked !== isPixiv) cb.click();
  }
});
await new Promise((r) => setTimeout(r, 600));

log('clicking Post button');
await extPage.evaluate(() => {
  const btn = Array.from(document.querySelectorAll('button')).find((b) =>
    /SNS に投稿|SNS をプレビュー|Post to|Preview on/i.test(b.textContent ?? ''),
  );
  if (!btn) throw new Error('post button not found');
  btn.click();
});

const start = Date.now();
const MAX = 90000;
while (Date.now() - start < MAX) {
  await new Promise((r) => setTimeout(r, 2000));
  let snap;
  try {
    snap = await pixPage.evaluate(() => ({
      url: location.href,
      title: document.querySelector('input[name="title"]')?.value ?? null,
      capLen: (document.querySelector('textarea[name="comment"]')?.value ?? '').length,
      tagInputVal: document.querySelector('input[placeholder="Tags"]')?.value ?? null,
      tagChips: document.querySelectorAll('[role="listitem"], [class*="chip" i]').length,
      previewCount: document.querySelectorAll('img[src^="blob:"], canvas').length,
      vis: document.querySelector('input[type="radio"][name="x_restrict"]:checked')?.value ?? null,
      ai: document.querySelector('input[type="radio"][name="ai_type"]:checked')?.value ?? null,
    }));
  } catch (e) { log(`eval err: ${e.message?.slice(0, 80)}`); continue; }
  log(`t+${Math.round((Date.now() - start) / 1000)}s`, snap);
  if (/\/artworks\//.test(snap.url)) {
    log('🎉 SUCCESS — /artworks/');
    break;
  }
}
log('done');
await browser.disconnect();
