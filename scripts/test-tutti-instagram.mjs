// Drive Tutti popup → Instagram dry-run, verify wizard 完走 (image + caption + Share highlight).
import puppeteer from 'puppeteer-core';
import { writeFileSync, appendFileSync, readFileSync } from 'fs';

const LOG = 'scripts/ig-test.log';
writeFileSync(LOG, `=== ${new Date().toISOString()} ===\n`);
const log = (...a) => {
  const line = a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x, null, 2))).join(' ');
  appendFileSync(LOG, line + '\n');
  process.stdout.write(line + '\n');
};
process.on('uncaughtException', (e) => { log('UNCAUGHT', e.message); process.exit(1); });

const EXT_ID = 'dophemlpjldcejjdjefpjbgngodopkfe';
const browser = await puppeteer.connect({ browserURL: 'http://localhost:9222', protocolTimeout: 240000 });

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

// IG は 1KB 以上必要なので既存スクショ流用
const png = readFileSync('scripts/all-sns-mastodon.png');
const tmpImg = 'C:\\Users\\komm64\\AppData\\Local\\Temp\\tutti-ig-test.png';
writeFileSync(tmpImg, png);

log('opening popup...');
const popup = await browser.newPage();
await popup.goto(`chrome-extension://${EXT_ID}/popup.html`, { waitUntil: 'domcontentloaded' });
await new Promise((r) => setTimeout(r, 1500));

log('configuring popup (autoPost=false, only IG selected)...');
await popup.evaluate(() => Promise.all([
  new Promise((r) => chrome.storage.sync.set({ settings: { autoPost: false } }, r)),
  new Promise((r) => chrome.storage.session.remove('draft', r)),
  new Promise((r) => chrome.storage.local.set({ selectedPlatforms: { instagram: true, x: false, bluesky: false, threads: false, mastodon: false, misskey: false, tumblr: false, pixiv: false, deviantart: false } }, r)),
]));
await popup.reload({ waitUntil: 'domcontentloaded' });
await new Promise((r) => setTimeout(r, 1500));

const testText = 'Tutti IG test caption.\nLine 2 of caption body.';
log(`typing text: "${testText.slice(0, 40)}..."`);
await popup.evaluate(() => document.querySelector('textarea').focus());
await popup.type('textarea', testText);
const fi = await popup.$('input[type="file"]');
await fi.uploadFile(tmpImg);
await new Promise((r) => setTimeout(r, 1500));

await popup.evaluate(() => {
  for (const cb of Array.from(document.querySelectorAll('input[type="checkbox"]'))) {
    const label = cb.closest('label');
    const isIG = /Instagram/i.test(label?.textContent ?? '');
    if (cb.checked !== isIG) cb.click();
  }
});
await new Promise((r) => setTimeout(r, 600));

// click 前に既存の IG タブを閉じる
const beforeTabs = await browser.pages();
for (const p of beforeTabs) {
  if (/instagram\.com/.test(p.url()) && p !== popup) {
    try { await p.close(); } catch {}
  }
}

log('clicking Post button...');
await popup.evaluate(() => {
  const btn = Array.from(document.querySelectorAll('button')).find((b) =>
    /SNS に投稿|SNS をプレビュー|Post to|Preview on/i.test(b.textContent ?? ''),
  );
  if (!btn) throw new Error('post button not found in popup');
  btn.click();
});

log('\n=== watching IG tab ===');
let ig = null;
for (let i = 0; i < 80; i++) {
  await new Promise((r) => setTimeout(r, 1000));
  const all = await browser.pages();
  ig = all.find((p) => /instagram\.com\//.test(p.url()) && p !== popup);
  if (!ig) {
    if (i % 5 === 0) log(`t+${i}s waiting for IG tab...`);
    continue;
  }
  let state;
  try {
    state = await ig.evaluate(() => {
      const dlg = document.querySelector('[role="dialog"]');
      const captionEl = document.querySelector('[role="dialog"] div[contenteditable="true"][aria-label="Write a caption..."]');
      const buttons = dlg ? Array.from(dlg.querySelectorAll('button, [role="button"]')).map((b) => ({
        text: (b.textContent ?? '').trim().slice(0, 30),
        outline: b.style?.outline ?? '',
      })).filter((x) => x.text.length > 0).slice(0, 6) : [];
      const heading = dlg?.querySelector('h1, h2, [role="heading"]')?.textContent?.trim() ?? null;
      return {
        url: location.href,
        hasDialog: !!dlg,
        heading,
        captionLen: captionEl?.textContent?.length ?? 0,
        captionPreview: (captionEl?.textContent ?? '').slice(0, 50),
        buttons,
      };
    });
  } catch (e) {
    log(`t+${i}s eval failed: ${e.message?.slice(0, 100)}`);
    continue;
  }
  log(`t+${i}s ${JSON.stringify(state)}`);
  // 完走判定: caption に text が入ってる + Share button に highlight
  const shareHighlighted = state.buttons.some((b) => /^share$/i.test(b.text) && b.outline.includes('dashed'));
  if (state.captionLen > 0 && shareHighlighted) {
    log('  → IG dry-run OK (wizard 完走 + caption + Share highlight)');
    break;
  }
}
if (ig) await ig.screenshot({ path: 'scripts/ig-test-result.png', fullPage: false });
log('done');
await browser.disconnect();
