// Try drag & drop simulation for SNS without accessible file input.
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'fs';
const browser = await puppeteer.connect({ browserURL: 'http://localhost:9222' });

const png = readFileSync('C:\\Users\\komm64\\AppData\\Local\\Temp\\tutti-test-100x100.png');
const b64 = png.toString('base64');

async function tryDrop(label, url, dropSelectorList) {
  console.log(`\n=== ${label} ===`);
  for (const p of await browser.pages()) {
    if (p.url().includes(new URL(url).hostname)) await p.close();
  }
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 5000));
  page.on('console', m => console.log(`  [page]`, m.text().slice(0, 200)));

  const result = await page.evaluate(async (b64, selectors) => {
    const bin = atob(b64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    const file = new File([arr], 'test.png', { type: 'image/png', lastModified: Date.now() });

    let target = null;
    for (const sel of selectors) {
      target = document.querySelector(sel);
      if (target) { console.log('drop target found via:', sel); break; }
    }
    if (!target) return { error: 'no drop target found' };

    const dt = new DataTransfer();
    dt.items.add(file);

    for (const type of ['dragenter', 'dragover', 'drop']) {
      const ev = new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt });
      target.dispatchEvent(ev);
    }
    return { ok: true, targetTag: target.tagName, targetClass: target.className?.slice?.(0, 60) };
  }, b64, dropSelectorList);
  console.log('  drop result:', result);

  await new Promise(r => setTimeout(r, 5000));
  const after = await page.evaluate(() => ({
    hasBlobImg: !!document.querySelector('img[src^="blob:"]'),
    hasDataImg: !!document.querySelector('img[src^="data:image"]'),
    bodyHasEditOrRemove: /Edit|Remove|削除|✕|×/.test(document.body.innerText),
  }));
  console.log('  after drop:', after);
  await page.screenshot({ path: `C:/Users/komm64/Projects/tutti/scripts/drop-${label.toLowerCase()}.png` });
  await page.close();
}

await tryDrop('Bluesky', 'https://bsky.app/intent/compose?text=drop-test',
  ['[data-testid="composer"]', '[contenteditable="true"][role="textbox"]', 'div[role="dialog"]']);

await tryDrop('Misskey', 'https://misskey.io/share?text=drop-test',
  ['textarea', '.compose-form', 'div[contenteditable="true"]']);

await tryDrop('Tumblr', 'https://www.tumblr.com/new/text',
  ['[contenteditable="true"]', '.block-editor-rich-text__editable', 'main', 'div[role="dialog"]']);

await browser.disconnect();
