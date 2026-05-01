// Drive Tutti popup → Pixiv dry-run, verify title + caption + image got injected.
import puppeteer from 'puppeteer-core';
import { writeFileSync, appendFileSync } from 'fs';

const LOG = 'scripts/pixiv-test.log';
writeFileSync(LOG, `=== ${new Date().toISOString()} ===\n`);
const log = (...a) => {
  const line = a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x, null, 2))).join(' ');
  appendFileSync(LOG, line + '\n');
  process.stdout.write(line + '\n');
};
process.on('uncaughtException', (e) => { log('UNCAUGHT', e.message); process.exit(1); });

const EXT_ID = 'dophemlpjldcejjdjefpjbgngodopkfe';
const browser = await puppeteer.connect({ browserURL: 'http://localhost:9222', protocolTimeout: 240000 });

// log everything from any page
async function attachAll() {
  for (const p of await browser.pages()) {
    if (p._tutti) continue;
    p._tutti = true;
    p.on('console', (m) => {
      const t = m.text();
      if (t.includes('[Tutti]') || t.includes('[tutti]') || m.type() === 'error') {
        log(`[${p.url().slice(0, 60)} ${m.type()}]`, t.slice(0, 250));
      }
    });
  }
}
await attachAll();
browser.on('targetcreated', () => setTimeout(attachAll, 300));

// Test image: 100x100 red PNG
const png = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x64, 0x00, 0x00, 0x00, 0x64, 0x08, 0x02, 0x00, 0x00, 0x00, 0xff, 0x80, 0x02,
  0x03, 0x00, 0x00, 0x00, 0x4f, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0xed, 0xc1, 0x01, 0x0d, 0x00,
  0x00, 0x00, 0xc2, 0xa0, 0xf7, 0x4f, 0x6d, 0x0e, 0x37, 0xa0, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0xbe, 0x0d, 0x21, 0x00, 0x00, 0x01, 0x9f, 0xab, 0xfd, 0x9c, 0x00, 0x00, 0x00, 0x00,
  0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
]);
const tmpImg = 'C:\\Users\\komm64\\AppData\\Local\\Temp\\tutti-pixiv-test.png';
writeFileSync(tmpImg, png);

// Open popup
log('opening popup...');
const popup = await browser.newPage();
await popup.goto(`chrome-extension://${EXT_ID}/popup.html`, { waitUntil: 'domcontentloaded' });
await new Promise((r) => setTimeout(r, 1500));

// Set autoPost=false (preview mode), clear any prior draft, select pixiv only
log('configuring popup...');
await popup.evaluate(() => Promise.all([
  new Promise((r) => chrome.storage.sync.set({ settings: { autoPost: false, mastodonInstance: 'https://mastodon.social', misskeyInstance: 'https://misskey.io' } }, r)),
  new Promise((r) => chrome.storage.session.remove('draft', r)),
  new Promise((r) => chrome.storage.local.set({ selectedPlatforms: { pixiv: true, x: false, bluesky: false, threads: false, mastodon: false, misskey: false, tumblr: false } }, r)),
]));
await popup.reload({ waitUntil: 'domcontentloaded' });
await new Promise((r) => setTimeout(r, 1500));

// Compose
const testText = 'Tutti Pixiv test illustration\n\nThis is the body of the caption (line 2).\nLine 3 with detail.';
log(`typing text: "${testText.slice(0, 40)}..."`);
await popup.evaluate(() => document.querySelector('textarea').focus());
await popup.type('textarea', testText);
const fi = await popup.$('input[type="file"]');
await fi.uploadFile(tmpImg);
await new Promise((r) => setTimeout(r, 1500));

// Make sure only Pixiv is checked (in case storage didn't sync)
await popup.evaluate(() => {
  for (const cb of Array.from(document.querySelectorAll('input[type="checkbox"]'))) {
    const label = cb.closest('label');
    const isPixiv = /Pixiv/i.test(label?.textContent ?? '');
    if (cb.checked !== isPixiv) cb.click();
  }
});
await new Promise((r) => setTimeout(r, 600));

// Click post button
log('clicking Post button...');
await popup.evaluate(() => {
  const btn = Array.from(document.querySelectorAll('button')).find((b) =>
    /SNS に投稿|SNS をプレビュー|Post to|Preview on/i.test(b.textContent ?? ''),
  );
  if (!btn) throw new Error('post button not found in popup');
  btn.click();
});

// Watch Pixiv tab
log('\n=== watching Pixiv tab ===');
let pix = null;
for (let i = 0; i < 30; i++) {
  await new Promise((r) => setTimeout(r, 1000));
  const all = await browser.pages();
  pix = all.find((p) => /pixiv\.net\/(illustration\/create|upload\.php|manga\/create)/.test(p.url()));
  if (!pix) {
    if (i % 3 === 0) log(`t+${i}s waiting for Pixiv compose tab...`);
    continue;
  }
  let state;
  try {
    state = await pix.evaluate(() => {
      const fi = document.querySelector('input[type="file"][name="files[]"]');
      const titleEl = document.querySelector('input[name="title"]');
      const captionEl = document.querySelector('textarea[name="comment"]');
      const post = document.querySelector('.gtm-work-post-button-in-header-click');
      const previews = document.querySelectorAll('img[src^="blob:"], canvas');
      const dialog = document.querySelector('[role="dialog"]');
      return {
        url: location.href,
        fileCount: fi?.files?.length ?? 0,
        titleValue: titleEl?.value ?? null,
        captionValue: captionEl?.value ?? null,
        previewCount: previews.length,
        postBtnDisabled: post ? (post.disabled || post.getAttribute('aria-disabled') === 'true') : 'no-btn',
        postBtnOutline: post?.style?.outline ?? null,
        hasDialog: !!dialog,
      };
    });
  } catch (e) {
    log(`t+${i}s eval failed: ${e.message?.slice(0, 100)}`);
    continue;
  }
  log(`t+${i}s ${JSON.stringify(state)}`);
  if (state.titleValue && state.captionValue && (state.previewCount > 0 || state.fileCount > 0)) {
    log('  → all 3 fields populated. Pixiv dry-run OK.');
    break;
  }
}
if (pix) await pix.screenshot({ path: 'scripts/pixiv-test-result.png', fullPage: true });
log('done');
await browser.disconnect();
