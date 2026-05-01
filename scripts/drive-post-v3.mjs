// Drive post + freeze Bluesky tab right when content script reports ready, screenshot DOM.
import puppeteer from 'puppeteer-core';
import { writeFileSync } from 'fs';

const EXT_ID = 'dophemlpjldcejjdjefpjbgngodopkfe';
const browser = await puppeteer.connect({ browserURL: 'http://localhost:9222' });

const allLogs = [];
async function attachAll() {
  for (const p of await browser.pages()) {
    if (p._tutti) continue;
    p._tutti = true;
    p.on('console', (m) => {
      const t = m.text();
      if (t.includes('[Tutti]') || m.type() === 'error' || m.type() === 'warning') {
        allLogs.push({ url: p.url().slice(0, 60), type: m.type(), text: t.slice(0, 300), at: Date.now() });
      }
    });
    p.on('pageerror', (e) => allLogs.push({ url: p.url().slice(0, 60), type: 'pageerror', text: e.message, at: Date.now() }));
  }
}
await attachAll();
browser.on('targetcreated', () => setTimeout(attachAll, 300));

// Test image
const png = Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,0,0,0,0x0d,0x49,0x48,0x44,0x52,0,0,0,1,0,0,0,1,8,6,0,0,0,0x1f,0x15,0xc4,0x89,0,0,0,0x0d,0x49,0x44,0x41,0x54,0x78,0x9c,0x63,0xfc,0xcf,0xc0,0,0,0,3,0,1,0x46,0x4d,0x44,0x41,0,0,0,0,0x49,0x45,0x4e,0x44,0xae,0x42,0x60,0x82]);
const tmpImg = 'C:\\Users\\komm64\\AppData\\Local\\Temp\\tutti-test-image.png';
writeFileSync(tmpImg, png);

// Open popup
const popup = await browser.newPage();
await popup.goto(`chrome-extension://${EXT_ID}/popup.html`);
await new Promise(r => setTimeout(r, 1500));
await popup.evaluate(() => new Promise(r => chrome.storage.sync.set({ settings: { mastodonInstance: 'https://mastodon.social', misskeyInstance: 'https://misskey.io', dryRun: true } }, r)));
await popup.reload();
await new Promise(r => setTimeout(r, 1500));
await attachAll();
await popup.type('textarea', 'Tutti DEBUG ' + Date.now());
const fi = await popup.$('input[type="file"]');
await fi.uploadFile(tmpImg);
await new Promise(r => setTimeout(r, 1500));
await popup.evaluate(() => {
  for (const cb of Array.from(document.querySelectorAll('input[type="checkbox"]'))) {
    const want = cb.closest('label')?.textContent?.includes('Bluesky');
    if (cb.checked !== want) cb.click();
  }
});
await new Promise(r => setTimeout(r, 400));

console.log('=== POST clicked ===');
await popup.evaluate(() => {
  const btn = Array.from(document.querySelectorAll('button')).find(b => /SNS に投稿|Post to/.test(b.textContent ?? ''));
  btn?.click();
});

// Watch for bsky compose tab and grab state at multiple points
let bsky = null;
for (let i = 0; i < 15; i++) {
  await new Promise(r => setTimeout(r, 1000));
  bsky = (await browser.pages()).find(p => /bsky\.app/.test(p.url()) && /\/intent\/compose|compose/.test(p.url()));
  if (!bsky) bsky = (await browser.pages()).find(p => /bsky\.app/.test(p.url()) && p !== popup);
  if (bsky) {
    console.log(`[t+${i}s] bsky tab URL: ${bsky.url().slice(0, 100)}`);
  }
}

if (bsky) {
  // Freeze and inspect
  const state = await bsky.evaluate(() => {
    const composer = document.querySelector('[data-testid="composer"]');
    const allFileInputs = Array.from(document.querySelectorAll('input[type="file"]')).map(i => ({
      accept: i.accept, multiple: i.multiple, hidden: i.offsetParent === null,
      hasFiles: i.files?.length ?? 0,
      parentDataTestid: i.closest('[data-testid]')?.getAttribute('data-testid'),
    }));
    const publishBtns = Array.from(document.querySelectorAll('[aria-label="Publish post"], [data-testid="composerPublishBtn"]'));
    const buttons = Array.from(document.querySelectorAll('button, [role="button"]')).slice(0, 30).map(b => ({
      text: (b.textContent ?? '').trim().slice(0, 30),
      aria: b.getAttribute('aria-label'),
      testid: b.getAttribute('data-testid'),
      disabled: b.disabled || b.getAttribute('aria-disabled') === 'true',
    }));
    return {
      url: location.href,
      composerExists: !!composer,
      composerInnerLen: composer?.innerHTML?.length ?? 0,
      composerHtmlSnippet: composer?.innerHTML?.slice(0, 800),
      allFileInputs,
      publishBtnCount: publishBtns.length,
      buttonsSample: buttons.slice(0, 15),
      contentEditableExists: !!document.querySelector('[contenteditable="true"]'),
    };
  });
  console.log('\n=== bsky tab state ===');
  console.log(JSON.stringify(state, null, 2));

  await bsky.screenshot({ path: 'scripts/bsky-state.png' });
  console.log('screenshot saved');
}

console.log('\n=== all collected logs ===');
for (const l of allLogs) console.log(`[${l.url} ${l.type}]`, l.text);

await browser.disconnect();
