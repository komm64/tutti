// Try simulating clipboard paste of an image into Tumblr's editor.
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'fs';
const browser = await puppeteer.connect({ browserURL: 'http://localhost:9222' });

const png = readFileSync('C:\\Users\\komm64\\AppData\\Local\\Temp\\tutti-test-100x100.png');
const b64 = png.toString('base64');

for (const p of await browser.pages()) {
  if (/tumblr\.com/.test(p.url())) await p.close();
}
const page = await browser.newPage();
page.on('console', m => console.log(`[page]`, m.text().slice(0, 250)));
await page.goto('https://www.tumblr.com/new/text', { waitUntil: 'domcontentloaded' });
await new Promise(r => setTimeout(r, 5000));

// Focus editor and dispatch paste with image
const result = await page.evaluate(async (b64) => {
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  const file = new File([arr], 'paste.png', { type: 'image/png', lastModified: Date.now() });
  const editable = document.querySelector('[contenteditable="true"][role="document"]')
                   || document.querySelector('[contenteditable="true"]');
  if (!editable) return { error: 'no editable' };
  editable.focus();
  const dt = new DataTransfer();
  dt.items.add(file);
  const ev = new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: dt });
  editable.dispatchEvent(ev);
  return { ok: true, target: editable.tagName };
}, b64);
console.log('paste result:', result);

await new Promise(r => setTimeout(r, 5000));
const after = await page.evaluate(() => ({
  hasBlobImg: !!document.querySelector('img[src^="blob:"]'),
  blobImgs: Array.from(document.querySelectorAll('img[src^="blob:"]')).length,
  hasFigure: !!document.querySelector('figure'),
  hasImageBlock: !!document.querySelector('[data-block-type="image"], .image-block, [class*="image-block"]'),
}));
console.log('after paste:', after);
await page.screenshot({ path: 'scripts/tumblr-paste.png' });

await browser.disconnect();
