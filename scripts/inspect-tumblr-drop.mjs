// Find a drop target for Tumblr that triggers image upload (rather than the
// inline block-type chooser).
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'fs';
const browser = await puppeteer.connect({ browserURL: 'http://localhost:9222' });

const png = readFileSync('C:\\Users\\komm64\\AppData\\Local\\Temp\\tutti-test-100x100.png');
const b64 = png.toString('base64');

async function tryDrop(targetSelectorList) {
  for (const p of await browser.pages()) {
    if (/tumblr\.com/.test(p.url())) await p.close();
  }
  const page = await browser.newPage();
  page.on('console', m => console.log(`[page]`, m.text().slice(0, 250)));
  await page.goto('https://www.tumblr.com/new/text', { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 5000));

  const result = await page.evaluate(async (b64, selectors) => {
    const bin = atob(b64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    const file = new File([arr], 'test.png', { type: 'image/png', lastModified: Date.now() });

    const tried = [];
    for (const sel of selectors) {
      const target = document.querySelector(sel);
      if (!target) { tried.push({ sel, found: false }); continue; }

      const dt = new DataTransfer();
      dt.items.add(file);
      for (const type of ['dragenter', 'dragover', 'drop']) {
        const ev = new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt });
        target.dispatchEvent(ev);
      }
      console.log('dropped on', sel, target.tagName, (target.className?.slice?.(0, 60)) ?? '');
      tried.push({ sel, found: true, tag: target.tagName });
      // wait briefly between drops
      await new Promise(r => setTimeout(r, 1500));
    }
    return tried;
  }, b64, targetSelectorList);

  console.log('tried:', result);
  await new Promise(r => setTimeout(r, 3000));
  const after = await page.evaluate(() => ({
    hasBlobImg: !!document.querySelector('img[src^="blob:"]'),
    hasDataImg: !!document.querySelector('img[src^="data:image"]'),
    bodyContains: ['Remove', 'remove', '✕', '×', 'image', 'Image', 'photo'].filter(w => document.body.innerText.includes(w)),
  }));
  console.log('after:', after);
  await page.screenshot({ path: 'C:/Users/komm64/Projects/tutti/scripts/tumblr-drop-probe.png' });
  await page.close();
}

await tryDrop([
  '[role="dialog"]',
  '.block-editor-block-list__layout',
  '.block-editor-writing-flow',
  '[contenteditable="true"][role="document"]',
  '.editor-styles-wrapper',
  '.block-editor',
  'main',
]);

await browser.disconnect();
