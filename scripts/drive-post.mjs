// Drive Tutti popup: enable dry-run, compose text + image, click post, observe.
import puppeteer from 'puppeteer-core';
import { writeFileSync } from 'fs';
import path from 'path';

const EXT_ID = 'dophemlpjldcejjdjefpjbgngodopkfe';

const browser = await puppeteer.connect({ browserURL: 'http://localhost:9222' });

// 1. Set dry-run = true via storage (use any tab to call chrome.storage)
const tabs = await browser.pages();
let any = tabs[0];
if (!any.url().startsWith('http') && !any.url().startsWith('chrome-extension')) {
  await any.goto('https://bsky.app/');
}

// 2. Make a tiny test PNG (1x1 red dot)
const pngBytes = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
  0x89, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0xfc, 0xcf, 0xc0, 0x00,
  0x00, 0x00, 0x03, 0x00, 0x01, 0x46, 0x4d, 0x44, 0x41, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e,
  0x44, 0xae, 0x42, 0x60, 0x82,
]);
const tmpImg = 'C:\\Users\\komm64\\AppData\\Local\\Temp\\tutti-test-image.png';
writeFileSync(tmpImg, pngBytes);
console.log('test image written:', tmpImg);

// 3. Open popup as a tab
const popup = await browser.newPage();
const popupLogs = [];
popup.on('console', (m) => popupLogs.push(`[popup ${m.type()}] ${m.text()}`));
popup.on('pageerror', (e) => popupLogs.push(`[popup error] ${e.message}`));
await popup.goto(`chrome-extension://${EXT_ID}/popup.html`, { waitUntil: 'domcontentloaded' });
await new Promise((r) => setTimeout(r, 1500));

// 4. Set dry-run via popup's chrome.storage.sync (popup has chrome API)
await popup.evaluate(() => {
  return new Promise((r) => chrome.storage.sync.set({ settings: { mastodonInstance: 'https://mastodon.social', misskeyInstance: 'https://misskey.io', dryRun: true } }, r));
});
console.log('dry-run enabled');

// Reload popup to pick up new setting
await popup.reload({ waitUntil: 'domcontentloaded' });
await new Promise((r) => setTimeout(r, 1500));

// 5. Set text
await popup.type('textarea', 'Tutti dry-run test ' + Date.now());
console.log('text set');

// 6. Attach image via file input
const fileInput = await popup.$('input[type="file"]');
if (!fileInput) {
  console.log('!!! file input not found in popup');
  await browser.disconnect();
  process.exit(1);
}
await fileInput.uploadFile(tmpImg);
console.log('image uploaded');
await new Promise((r) => setTimeout(r, 1500));

// 7. Inspect popup state
const state = await popup.evaluate(() => {
  const checkboxes = Array.from(document.querySelectorAll('input[type="checkbox"]')).map((cb, i) => ({
    i, checked: cb.checked, label: cb.closest('label')?.textContent?.trim()?.slice(0, 30),
  }));
  const imgs = Array.from(document.querySelectorAll('main img')).map(img => ({ src: img.src.slice(0, 60), alt: img.alt }));
  return {
    text: document.querySelector('textarea')?.value,
    checkboxes,
    images: imgs,
    bodyText: document.body.innerText.slice(0, 500),
  };
});
console.log('popup state:', JSON.stringify(state, null, 2));

// 8. Uncheck all except Bluesky for focused test
await popup.evaluate(() => {
  const cbs = Array.from(document.querySelectorAll('input[type="checkbox"]'));
  for (const cb of cbs) {
    const label = cb.closest('label')?.textContent ?? '';
    const wantChecked = label.includes('Bluesky');
    if (cb.checked !== wantChecked) cb.click();
  }
});
console.log('platforms: Bluesky only');
await new Promise(r => setTimeout(r, 500));

// 9. Click post button
console.log('clicking post...');
const postClicked = await popup.evaluate(() => {
  const btns = Array.from(document.querySelectorAll('button'));
  const post = btns.find((b) => /SNS に投稿|Post to/.test(b.textContent ?? ''));
  if (!post) return { ok: false, btns: btns.map(b => b.textContent?.slice(0, 30)) };
  if (post.disabled) return { ok: false, disabled: true };
  post.click();
  return { ok: true, label: post.textContent?.trim() };
});
console.log('post click:', postClicked);

// 10. Wait for post flow + watch Bluesky tab
await new Promise(r => setTimeout(r, 12000));

// Check Bluesky tab
const allPages = await browser.pages();
const bskyPage = allPages.find((p) => /bsky\.app/.test(p.url()) && p.url() !== 'https://bsky.app/');
if (bskyPage) {
  console.log('\nbluesky compose tab URL:', bskyPage.url());
  const bskyState = await bskyPage.evaluate(() => {
    return {
      text: document.querySelector('[contenteditable="true"]')?.textContent?.slice(0, 100),
      hasComposer: !!document.querySelector('[data-testid="composer"]'),
      imgInComposer: Array.from(document.querySelectorAll('[data-testid="composer"] img')).map(i => i.src.slice(0, 80)),
      imagePreview: Array.from(document.querySelectorAll('img')).filter(i => /preview|attach/i.test(i.alt)).map(i => i.alt),
      postBtnDisabled: document.querySelector('[aria-label="Publish post"]')?.getAttribute('aria-disabled'),
      bodySnippet: document.body.innerText.slice(0, 400),
    };
  });
  console.log('bluesky compose state:', JSON.stringify(bskyState, null, 2));
}

console.log('\n=== popup logs ===');
for (const l of popupLogs.slice(-30)) console.log(l.slice(0, 250));

await browser.disconnect();
