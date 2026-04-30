// More verbose: capture background SW logs, all tabs, errors.
import puppeteer from 'puppeteer-core';
import { writeFileSync } from 'fs';

const EXT_ID = 'dophemlpjldcejjdjefpjbgngodopkfe';
const browser = await puppeteer.connect({ browserURL: 'http://localhost:9222' });

// Connect to background service worker
const allTargets = await browser.targets();
const swTarget = allTargets.find((t) => t.url().includes(`${EXT_ID}/background.js`) || t.type() === 'service_worker');
console.log('SW target:', swTarget?.url() ?? 'NONE');
let swPage = null;
if (swTarget) {
  try {
    const worker = await swTarget.worker();
    if (worker) {
      worker.on('console', (m) => console.log(`[BG ${m.type()}]`, m.text().slice(0, 200)));
    }
    console.log('attached SW listener');
  } catch (e) {
    console.log('SW attach error:', e.message);
  }
}

// Listen on every page for [Tutti] logs
async function attachListeners() {
  for (const p of await browser.pages()) {
    if (p._tuttiAttached) continue;
    p._tuttiAttached = true;
    p.on('console', (m) => {
      const t = m.text();
      if (t.includes('[Tutti]') || m.type() === 'error') console.log(`[${p.url().slice(0, 50)} ${m.type()}]`, t.slice(0, 250));
    });
    p.on('pageerror', (e) => console.log(`[${p.url().slice(0, 50)} error]`, e.message));
  }
}
await attachListeners();
browser.on('targetcreated', async (t) => {
  setTimeout(attachListeners, 500);
  if (t.type() === 'page') console.log('[NEW TAB]', t.url().slice(0, 100));
});

// Generate test image
const pngBytes = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
  0x89, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0xfc, 0xcf, 0xc0, 0x00,
  0x00, 0x00, 0x03, 0x00, 0x01, 0x46, 0x4d, 0x44, 0x41, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e,
  0x44, 0xae, 0x42, 0x60, 0x82,
]);
const tmpImg = 'C:\\Users\\komm64\\AppData\\Local\\Temp\\tutti-test-image.png';
writeFileSync(tmpImg, pngBytes);

// Open popup
const popup = await browser.newPage();
await popup.goto(`chrome-extension://${EXT_ID}/popup.html`, { waitUntil: 'domcontentloaded' });
await new Promise(r => setTimeout(r, 1500));

// Set dry-run
await popup.evaluate(() => new Promise(r => chrome.storage.sync.set({ settings: { mastodonInstance: 'https://mastodon.social', misskeyInstance: 'https://misskey.io', dryRun: true } }, r)));
await popup.reload({ waitUntil: 'domcontentloaded' });
await new Promise(r => setTimeout(r, 1500));
await attachListeners();

// Compose
await popup.type('textarea', 'Tutti dry-run ' + Date.now());
const fileInput = await popup.$('input[type="file"]');
await fileInput.uploadFile(tmpImg);
await new Promise(r => setTimeout(r, 1500));

// Uncheck all except Bluesky
await popup.evaluate(() => {
  for (const cb of Array.from(document.querySelectorAll('input[type="checkbox"]'))) {
    const label = cb.closest('label')?.textContent ?? '';
    const wantChecked = label.includes('Bluesky');
    if (cb.checked !== wantChecked) cb.click();
  }
});
await new Promise(r => setTimeout(r, 500));

console.log('=== clicking POST ===');
await popup.evaluate(() => {
  const btn = Array.from(document.querySelectorAll('button')).find(b => /SNS に投稿|Post to/.test(b.textContent ?? ''));
  btn?.click();
});

// Wait for post flow
console.log('waiting 20s for post flow + content script...');
await new Promise(r => setTimeout(r, 20000));

// List all tabs
console.log('\n=== final tabs ===');
for (const p of await browser.pages()) {
  console.log(`  ${p.url().slice(0, 100)}  |  ${(await p.title()).slice(0, 50)}`);
}

// Check bsky tab
const bskyPage = (await browser.pages()).find(p => /bsky\.app\/intent\/compose/.test(p.url()));
if (bskyPage) {
  console.log('\nbsky compose URL:', bskyPage.url());
  const state = await bskyPage.evaluate(() => ({
    text: document.querySelector('[contenteditable="true"]')?.textContent?.slice(0, 100),
    composerExists: !!document.querySelector('[data-testid="composer"]'),
    fileInputs: Array.from(document.querySelectorAll('input[type="file"]')).map(i => ({ accept: i.accept, hidden: i.offsetParent === null })),
    composerHtml: document.querySelector('[data-testid="composer"]')?.innerHTML?.slice(0, 1500) ?? '(no composer)',
    publishBtn: !!document.querySelector('[aria-label="Publish post"]'),
    publishDisabled: document.querySelector('[aria-label="Publish post"]')?.getAttribute('aria-disabled'),
    imagesInDom: Array.from(document.querySelectorAll('[data-testid="composer"] img')).map(i => i.src.slice(0, 100)),
  }));
  console.log('bsky state:', JSON.stringify(state, null, 2));
} else {
  console.log('!!! no bsky compose tab opened');
}

await browser.disconnect();
