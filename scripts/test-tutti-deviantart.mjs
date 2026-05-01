// Drive Tutti popup → DeviantArt dry-run, verify image + title + description filled.
import puppeteer from 'puppeteer-core';
import { writeFileSync, appendFileSync } from 'fs';

const LOG = 'scripts/da-test.log';
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

const png = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x64, 0x00, 0x00, 0x00, 0x64, 0x08, 0x02, 0x00, 0x00, 0x00, 0xff, 0x80, 0x02,
  0x03, 0x00, 0x00, 0x00, 0x4f, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0xed, 0xc1, 0x01, 0x0d, 0x00,
  0x00, 0x00, 0xc2, 0xa0, 0xf7, 0x4f, 0x6d, 0x0e, 0x37, 0xa0, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0xbe, 0x0d, 0x21, 0x00, 0x00, 0x01, 0x9f, 0xab, 0xfd, 0x9c, 0x00, 0x00, 0x00, 0x00,
  0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
]);
const tmpImg = 'C:\\Users\\komm64\\AppData\\Local\\Temp\\tutti-da-test.png';
writeFileSync(tmpImg, png);

log('opening popup...');
const popup = await browser.newPage();
await popup.goto(`chrome-extension://${EXT_ID}/popup.html`, { waitUntil: 'domcontentloaded' });
await new Promise((r) => setTimeout(r, 1500));

log('configuring popup (autoPost=false, only DA selected)...');
await popup.evaluate(() => Promise.all([
  new Promise((r) => chrome.storage.sync.set({ settings: { autoPost: false } }, r)),
  new Promise((r) => chrome.storage.session.remove('draft', r)),
  new Promise((r) => chrome.storage.local.set({ selectedPlatforms: { deviantart: true, x: false, bluesky: false, threads: false, mastodon: false, misskey: false, tumblr: false, pixiv: false } }, r)),
]));
await popup.reload({ waitUntil: 'domcontentloaded' });
await new Promise((r) => setTimeout(r, 1500));

const testText = 'Tutti DA test deviation\n\nThis is the description body (line 2).\nLine 3.';
log(`typing text: "${testText.slice(0, 40)}..."`);
await popup.evaluate(() => document.querySelector('textarea').focus());
await popup.type('textarea', testText);
const fi = await popup.$('input[type="file"]');
await fi.uploadFile(tmpImg);
await new Promise((r) => setTimeout(r, 1500));

await popup.evaluate(() => {
  for (const cb of Array.from(document.querySelectorAll('input[type="checkbox"]'))) {
    const label = cb.closest('label');
    const isDA = /DeviantArt/i.test(label?.textContent ?? '');
    if (cb.checked !== isDA) cb.click();
  }
});
await new Promise((r) => setTimeout(r, 600));

// click 前に既存の DA タブを閉じる (404 タブを掴まないように)
const beforeTabs = await browser.pages();
for (const p of beforeTabs) {
  if (/deviantart\.com/.test(p.url()) && p !== popup) {
    try { await p.close(); } catch {}
  }
}
const closedCount = beforeTabs.filter((p) => /deviantart\.com/.test(p.url())).length;
log(`closed ${closedCount} pre-existing DA tabs`);

// popup の checkbox 状態確認
const popupState = await popup.evaluate(() => {
  const cbs = Array.from(document.querySelectorAll('input[type="checkbox"]')).map((cb) => {
    const lbl = cb.closest('label')?.textContent?.trim() ?? '';
    return { checked: cb.checked, label: lbl.slice(0, 30) };
  });
  return { cbs };
});
log('popup checkboxes:', popupState);

popup.on('console', (m) => {
  if (m.text().includes('[Tutti]') || m.text().includes('error') || m.type() === 'error') {
    log(`[popup ${m.type()}]`, m.text().slice(0, 300));
  }
});

log('clicking Post button...');
await popup.evaluate(() => {
  const btn = Array.from(document.querySelectorAll('button')).find((b) =>
    /SNS に投稿|SNS をプレビュー|Post to|Preview on/i.test(b.textContent ?? ''),
  );
  if (!btn) throw new Error('post button not found in popup');
  btn.click();
});

log('\n=== watching DeviantArt tab ===');
let da = null;
for (let i = 0; i < 60; i++) {
  await new Promise((r) => setTimeout(r, 1000));
  const all = await browser.pages();
  // /studio 限定で watch
  da = all.find((p) => /deviantart\.com\/studio/.test(p.url()));
  if (!da) {
    if (i % 5 === 0) log(`t+${i}s waiting for DA tab...`);
    continue;
  }
  let state;
  try {
    state = await da.evaluate(() => {
      const titleEl = document.querySelector('input[name="title"]');
      const descEl = document.querySelector('div.tiptap.ProseMirror');
      const submits = Array.from(document.querySelectorAll('button')).filter(
        (b) => (b.textContent ?? '').trim() === 'Submit',
      );
      const lastSubmit = submits[submits.length - 1];
      const next = document.querySelector('button[aria-label="Next"]');
      return {
        url: location.href,
        titleValue: titleEl?.value ?? null,
        descTextLen: descEl?.textContent?.length ?? 0,
        descPreview: (descEl?.textContent ?? '').slice(0, 60),
        submitCount: submits.length,
        lastSubmitOutline: lastSubmit?.style?.outline ?? null,
        nextDisabled: next ? (next.disabled || next.getAttribute('aria-disabled') === 'true') : 'no-btn',
      };
    });
  } catch (e) {
    log(`t+${i}s eval failed: ${e.message?.slice(0, 100)}`);
    continue;
  }
  log(`t+${i}s ${JSON.stringify(state)}`);
  if (state.titleValue && state.descTextLen > 0 && state.lastSubmitOutline) {
    log('  → DA dry-run OK (title/desc filled, finalize highlighted)');
    break;
  }
}
if (da) await da.screenshot({ path: 'scripts/da-test-result.png', fullPage: true });
log('done');
await browser.disconnect();
