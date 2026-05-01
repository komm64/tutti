// Tumblr probe v3: click "Add photo" + drop on .components-drop-zone.
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'fs';
const browser = await puppeteer.connect({ browserURL: 'http://localhost:9222', protocolTimeout: 60000 });

// Open fresh tumblr tab
for (const p of await browser.pages()) {
  if (/tumblr\.com/.test(p.url())) await p.close();
}
const page = await browser.newPage();
page.on('console', m => console.log(`[page]`, m.text().slice(0, 250)));
page.on('response', r => {
  if (r.url().includes('tumblr.com/api') || r.url().includes('upload')) {
    console.log(`[NET ${r.status()}]`, r.url().slice(0, 100));
  }
});
await page.goto('https://www.tumblr.com/new/text', { waitUntil: 'domcontentloaded' });
await new Promise(r => setTimeout(r, 5000));

// Suppress OS file picker
await page.evaluate(() => {
  const orig = HTMLInputElement.prototype.click;
  HTMLInputElement.prototype.click = function () {
    if (this.type === 'file') { console.log('[probe] suppressed file input.click()'); return; }
    return orig.call(this);
  };
});

// Phase 1: drop on existing .components-drop-zone (no Add photo click needed)
const png = readFileSync('C:\\Users\\komm64\\AppData\\Local\\Temp\\tutti-test-100x100.png');
const b64 = png.toString('base64');

console.log('\n=== Phase 1: drop on .components-drop-zone ===');
const dropResult = await page.evaluate(async (b64) => {
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  const file = new File([arr], 'tumblr.png', { type: 'image/png', lastModified: Date.now() });
  const dt = new DataTransfer();
  dt.items.add(file);

  const dropzones = Array.from(document.querySelectorAll('.components-drop-zone'));
  console.log(`[probe] ${dropzones.length} drop-zones found`);
  if (dropzones.length === 0) return { error: 'no drop-zone' };

  const target = dropzones[0];
  const r = target.getBoundingClientRect();
  console.log(`[probe] dropping on rect:`, r.x, r.y, r.width, r.height);

  for (const type of ['dragenter', 'dragover', 'drop']) {
    const ev = new DragEvent(type, {
      bubbles: true, cancelable: true, dataTransfer: dt,
      clientX: r.left + r.width / 2, clientY: r.top + r.height / 2,
    });
    target.dispatchEvent(ev);
  }
  return { ok: true, rect: [r.x, r.y, r.width, r.height] };
}, b64);
console.log('drop result:', dropResult);
await new Promise(r => setTimeout(r, 4000));

const phase1After = await page.evaluate(() => ({
  hasBlobImg: !!document.querySelector('img[src^="blob:"]'),
  hasDataImg: !!document.querySelector('img[src^="data:image"]'),
  blobImgs: Array.from(document.querySelectorAll('img[src^="blob:"]')).length,
  imageBlocks: Array.from(document.querySelectorAll('[data-block-type="image"], figure[class*="image"], [class*="image-block"]')).length,
  bodyHasUpload: /Upload|Replace|Crop|Edit\s*image/i.test(document.body.innerText),
}));
console.log('phase 1 after:', phase1After);
await page.screenshot({ path: 'C:/Users/komm64/Projects/tutti/scripts/tumblr-dropzone-test.png' });

// Phase 2: if drop didn't work, click "Add photo" then look at what mounted
if (!phase1After.hasBlobImg && !phase1After.imageBlocks) {
  console.log('\n=== Phase 2: click [aria-label="Add photo"] ===');
  const clicked = await page.evaluate(() => {
    const dialog = document.querySelector('[role="dialog"]');
    const btn = dialog?.querySelector('[aria-label="Add photo"]');
    if (!btn) return { error: 'no Add photo button' };
    console.log('[probe] clicking Add photo:', btn.outerHTML?.slice(0, 250));
    btn.click();
    return { ok: true };
  });
  console.log('Add photo clicked:', clicked);
  await new Promise(r => setTimeout(r, 2500));

  const phase2 = await page.evaluate(() => ({
    fileInputCount: document.querySelectorAll('input[type="file"]').length,
    fileInputs: Array.from(document.querySelectorAll('input[type="file"]')).map(f => ({
      accept: f.accept, multiple: f.multiple,
      parents: (() => { const a=[]; let n=f; while(n && a.length<5){ a.push(`${n.tagName}.${(n.className?.slice?.(0,40)) ?? ''}`); n=n.parentElement; } return a; })(),
    })),
    dropZoneCount: document.querySelectorAll('.components-drop-zone').length,
    newImageBlocks: Array.from(document.querySelectorAll('[data-type*="image"], figure, [class*="image-placeholder"]')).slice(0, 5).map(e => ({
      tag: e.tagName, class: e.className?.slice?.(0, 80),
    })),
    interestingButtons: Array.from(document.querySelectorAll('button, label'))
      .filter(b => /upload|browse|choose|select.*file|computer|click.*upload/i.test((b.textContent ?? '') + (b.getAttribute('aria-label') ?? '')))
      .slice(0, 10).map(b => ({ text: (b.textContent ?? '').slice(0, 50), aria: b.getAttribute('aria-label') })),
  }));
  console.log('phase 2:', JSON.stringify(phase2, null, 2));
  await page.screenshot({ path: 'C:/Users/komm64/Projects/tutti/scripts/tumblr-after-addphoto.png' });

  // Phase 3: try to drop on the new dropzone (in image block)
  if (phase2.dropZoneCount > 0) {
    console.log('\n=== Phase 3: drop on new dropzone in image block ===');
    const drop2 = await page.evaluate(async (b64) => {
      const bin = atob(b64);
      const arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      const file = new File([arr], 'tumblr.png', { type: 'image/png', lastModified: Date.now() });
      const dt = new DataTransfer();
      dt.items.add(file);

      const dropzones = Array.from(document.querySelectorAll('.components-drop-zone'));
      console.log(`[probe] ${dropzones.length} dropzones now`);
      // Try LAST one (newest)
      const target = dropzones[dropzones.length - 1];
      const r = target.getBoundingClientRect();
      console.log(`[probe] dropping rect:`, r.x, r.y, r.width, r.height);
      for (const type of ['dragenter', 'dragover', 'drop']) {
        const ev = new DragEvent(type, {
          bubbles: true, cancelable: true, dataTransfer: dt,
          clientX: r.left + r.width / 2, clientY: r.top + r.height / 2,
        });
        target.dispatchEvent(ev);
      }
      return { ok: true };
    }, b64);
    console.log('drop2:', drop2);
    await new Promise(r => setTimeout(r, 4000));
    const phase3 = await page.evaluate(() => ({
      hasBlobImg: !!document.querySelector('img[src^="blob:"]'),
      blobImgs: Array.from(document.querySelectorAll('img[src^="blob:"]')).map(i => i.src.slice(0, 50)),
    }));
    console.log('phase 3:', phase3);
    await page.screenshot({ path: 'C:/Users/komm64/Projects/tutti/scripts/tumblr-after-drop2.png' });
  }
}

await browser.disconnect();
