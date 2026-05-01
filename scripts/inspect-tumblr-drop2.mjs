// Tumblr drop attempt 2: explore window.tumblr API + try drop on body/window.
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

// 1. Explore window.tumblr API
const tApi = await page.evaluate(() => {
  const w = window;
  if (!w.tumblr) return { absent: true };
  const props = Object.keys(w.tumblr).slice(0, 50);
  const subs = {};
  for (const k of props) {
    const v = w.tumblr[k];
    if (typeof v === 'object' && v) {
      subs[k] = Object.keys(v).slice(0, 30);
    } else {
      subs[k] = typeof v;
    }
  }
  return { props, subs };
});
console.log('window.tumblr:', JSON.stringify(tApi, null, 2).slice(0, 2000));

// 2. Try drop on body and document
const result = await page.evaluate(async (b64) => {
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  const file = new File([arr], 'test.png', { type: 'image/png', lastModified: Date.now() });

  const tried = [];
  const targets = [
    ['document.body', document.body],
    ['document.documentElement', document.documentElement],
    ['window', window],
    // file:// drop is sometimes captured by a specific overlay div
  ];
  for (const [name, t] of targets) {
    if (!t) { tried.push({ name, found: false }); continue; }
    const dt = new DataTransfer();
    dt.items.add(file);
    for (const type of ['dragenter', 'dragover', 'drop']) {
      const ev = new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt });
      t.dispatchEvent(ev);
    }
    console.log('dropped on', name);
    tried.push({ name, found: true });
    await new Promise(r => setTimeout(r, 1500));
  }
  return tried;
}, b64);

console.log('drops:', result);
await new Promise(r => setTimeout(r, 4000));

const after = await page.evaluate(() => ({
  hasBlobImg: !!document.querySelector('img[src^="blob:"]'),
  imgs: Array.from(document.querySelectorAll('img')).map(i => i.src.slice(0, 80)).slice(0, 10),
  hasFigure: !!document.querySelector('.block-editor figure'),
}));
console.log('after:', after);
await page.screenshot({ path: 'C:/Users/komm64/Projects/tutti/scripts/tumblr-drop-probe2.png' });

// 3. Try clicking the "Image" block-type button to insert an image block, then look for input
console.log('\n=== try click "Image" block ===');
const imageBtnInfo = await page.evaluate(() => {
  const btn = document.querySelector('button[aria-label="Image"]');
  if (!btn) return { error: 'no Image btn' };
  // Override input.click to intercept
  const orig = HTMLInputElement.prototype.click;
  HTMLInputElement.prototype.click = function() {
    if (this.type === 'file') {
      console.log('intercepted file input.click():', this.outerHTML?.slice(0, 200));
      return;
    }
    return orig.call(this);
  };
  btn.click();
  return { clicked: true };
});
console.log('imageBtn:', imageBtnInfo);
await new Promise(r => setTimeout(r, 3000));
const fis = await page.evaluate(() => {
  return Array.from(document.querySelectorAll('input[type="file"]')).map(f => ({
    accept: f.accept, multiple: f.multiple,
    parents: (() => { const a=[]; let n=f; while(n && a.length<5){ a.push((n.className?.slice?.(0,60)) ?? n.tagName); n=n.parentElement; } return a; })(),
  }));
});
console.log('file inputs after click:', fis);
await page.screenshot({ path: 'C:/Users/komm64/Projects/tutti/scripts/tumblr-after-image-click.png' });

await browser.disconnect();
