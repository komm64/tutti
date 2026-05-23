/**
 * v0.4.92 dummy dry-run: Bluesky に画像 + alt text + advanced section で post
 * を実行 (autoPost OFF = preview)。 popup → background → content script の
 * 経路で何も crash しないか確認。
 */
import puppeteer from 'puppeteer-core';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';

const browser = await puppeteer.connect({
  browserURL: 'http://localhost:9222',
  defaultViewport: null,
  protocolTimeout: 120000,
});
const EXT_ID = 'dophemlpjldcejjdjefpjbgngodopkfe';

let sw = browser.targets().find((t) => t.type() === 'service_worker' && t.url().includes(EXT_ID));
if (!sw) {
  const p = await browser.newPage();
  try { await p.goto(`chrome-extension://${EXT_ID}/popup.html`, { timeout: 8000 }); } catch {}
  for (let i = 0; i < 50; i++) {
    sw = browser.targets().find((t) => t.type() === 'service_worker' && t.url().includes(EXT_ID));
    if (sw) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  await p.close().catch(() => {});
}
const worker = await sw.worker();

// Bluesky tab を foreground にする
const pages = await browser.pages();
let bskyPage = pages.find((p) => /bsky\.app/.test(p.url()));
if (!bskyPage) bskyPage = await browser.newPage();
await bskyPage.bringToFront();
// compose modal を開いた状態にする (intent URL で compose dialog 起動)
await bskyPage.goto('https://bsky.app/intent/compose?text=', { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
await new Promise((r) => setTimeout(r, 4000));

const consoleLogs = [];
bskyPage.on('console', (m) => {
  if (/Tutti|tutti/i.test(m.text())) consoleLogs.push(`[${m.type()}] ${m.text()}`);
});

const imgB64 = readFileSync(resolve(process.cwd(), 'scripts/e2e/fixtures/test-image.jpg')).toString('base64');

// dry-run POST_TO_PLATFORM to Bluesky with alt + CW (CW should be ignored for Bluesky)
console.log('sending dry-run POST to Bluesky with alt text + visibility...');
const result = await worker.evaluate(async ({ imgB64 }) => {
  const tabs = await chrome.tabs.query({ url: 'https://bsky.app/*' });
  if (!tabs[0]) return { error: 'no Bluesky tab' };
  return await chrome.tabs.sendMessage(tabs[0].id, {
    type: 'POST_TO_PLATFORM',
    platform: 'bluesky',
    text: 'v0.4.92 verify post (dry-run)',
    dryRun: true,
    images: [{
      name: 'test.jpg',
      type: 'image/jpeg',
      data: imgB64,
      bytes: Math.floor(imgB64.length * 0.75),
      alt: 'A test image for Tutti verify (alt text v0.4.87)',
    }],
  });
}, { imgB64 });

console.log('\nresult:', JSON.stringify(result, null, 2));
console.log(`\n=== Tutti console logs (${consoleLogs.length}) ===`);
for (const l of consoleLogs) console.log(l);

browser.disconnect();
