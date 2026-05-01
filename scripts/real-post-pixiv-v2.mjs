// newPage() を使わない実投稿 driver。既存の chrome://extensions タブを popup に
// ナビゲートして使う。Brave の puppeteer.newPage 詰まり問題を回避。
import puppeteer from 'puppeteer-core';
import { writeFileSync, appendFileSync, readFileSync } from 'fs';

const LOG = 'scripts/realpost-pixiv-v2.log';
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

// 全タブから popup として使える候補を探す: extensions page か about:blank
const pages = await browser.pages();
log(`pages: ${pages.length}`);
let popupTab = pages.find((p) => /popup\.html/.test(p.url()));
if (!popupTab) {
  popupTab = pages.find((p) => /chrome:\/\/extensions/.test(p.url())) ?? pages.find((p) => p.url() === 'about:blank');
}
if (!popupTab) {
  log('no candidate tab to use as popup. open chrome://extensions/ first.');
  process.exit(1);
}
log(`using ${popupTab.url()} as popup tab`);

// Pixiv tab も attach
const pixTab = pages.find((p) => /pixiv\.net\/illustration\/create/.test(p.url()));
if (pixTab) {
  pixTab.on('console', (m) => {
    const t = m.text();
    if (/\[Tutti/i.test(t) || m.type() === 'error' || m.type() === 'warn') {
      log(`[pixiv ${m.type()}]`, t.slice(0, 250));
    }
  });
  log(`watching pixiv tab: ${pixTab.url()}`);
}

// popup ページを navigate (newPage じゃなく既存タブを再利用)
log('navigating to popup.html');
await popupTab.goto(`chrome-extension://${EXT_ID}/popup.html`, { waitUntil: 'domcontentloaded', timeout: 30000 });
log('popup loaded');
popupTab.on('console', (m) => {
  const t = m.text();
  if (/\[Tutti/i.test(t) || m.type() === 'error') {
    log(`[popup ${m.type()}]`, t.slice(0, 250));
  }
});

// settings + selectedPlatforms を Pixiv only / autoPost ON に
log('configuring storage');
await popupTab.evaluate(() => Promise.all([
  new Promise((r) => chrome.storage.sync.set({ settings: { autoPost: true } }, r)),
  new Promise((r) => chrome.storage.session.remove('draft', r)),
  new Promise((r) => chrome.storage.local.set({ selectedPlatforms: { pixiv: true, x: false, bluesky: false, threads: false, mastodon: false, misskey: false, tumblr: false, deviantart: false, instagram: false } }, r)),
]));
await popupTab.reload({ waitUntil: 'domcontentloaded' });
await new Promise((r) => setTimeout(r, 1500));

// 画像 + text を入れる
const png = readFileSync('scripts/all-sns-mastodon.png');
const tmpImg = 'C:\\Users\\komm64\\AppData\\Local\\Temp\\tutti-realpost-pixiv-v2.png';
writeFileSync(tmpImg, png);

const ts = Date.now().toString().slice(-6);
const testText = `Tutti realpost ${ts}\nLine 2.`;
log(`text="${testText.slice(0,40)}"`);
await popupTab.evaluate(() => document.querySelector('textarea').focus());
await popupTab.type('textarea', testText);
const fi = await popupTab.$('input[type="file"]');
await fi.uploadFile(tmpImg);
await new Promise((r) => setTimeout(r, 1500));

// Pixiv だけ ON
await popupTab.evaluate(() => {
  for (const cb of Array.from(document.querySelectorAll('input[type="checkbox"]'))) {
    const label = cb.closest('label');
    const isPixiv = /Pixiv/i.test(label?.textContent ?? '');
    if (cb.checked !== isPixiv) cb.click();
  }
});
await new Promise((r) => setTimeout(r, 600));

// 投稿
log('clicking Post button');
await popupTab.evaluate(() => {
  const btn = Array.from(document.querySelectorAll('button')).find((b) =>
    /SNS に投稿|SNS をプレビュー|Post to|Preview on/i.test(b.textContent ?? ''),
  );
  if (!btn) throw new Error('post button not found');
  btn.click();
});
log('Post clicked, watching...');

// Pixiv tab を 2s おきに snapshot
const start = Date.now();
const MAX = 60000;
while (Date.now() - start < MAX) {
  await new Promise((r) => setTimeout(r, 2000));
  const tab = (await browser.pages()).find((p) => /pixiv\.net/.test(p.url()));
  if (!tab) continue;
  let snap;
  try {
    snap = await tab.evaluate(() => ({
      url: location.href,
      title: document.querySelector('input[name="title"]')?.value ?? null,
      capLen: (document.querySelector('textarea[name="comment"]')?.value ?? '').length,
      tagInputVal: document.querySelector('input[placeholder="Tags"]')?.value ?? null,
      tagChips: document.querySelectorAll('[role="listitem"], .tag-input__chip, [class*="chip" i]').length,
      previewCount: document.querySelectorAll('img[src^="blob:"], canvas').length,
      vis: document.querySelector('input[type="radio"][name="x_restrict"]:checked')?.value ?? null,
      ai: document.querySelector('input[type="radio"][name="ai_type"]:checked')?.value ?? null,
    }));
  } catch (e) { log(`eval ${e.message?.slice(0, 60)}`); continue; }
  log(`t+${Math.round((Date.now() - start) / 1000)}s`, snap);
  if (/\/artworks\//.test(snap.url)) {
    log('🎉 SUCCESS — redirect to /artworks/');
    break;
  }
}
log('done');
await browser.disconnect();
