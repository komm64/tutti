// Focused X upload probe: identify what changes inside the image preview tile
// during upload vs after upload completion.
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'fs';
const browser = await puppeteer.connect({ browserURL: 'http://localhost:9222', protocolTimeout: 60000 });

const png = readFileSync('C:\\Users\\komm64\\AppData\\Local\\Temp\\tutti-test-100x100.png');
const b64 = png.toString('base64');

for (const p of await browser.pages()) {
  if (/x\.com|twitter\.com/.test(p.url())) await p.close();
}
const page = await browser.newPage();
page.on('response', r => {
  if (r.url().includes('upload') || r.url().includes('media')) {
    console.log(`[NET ${r.status()}] ${r.request().method()}`, r.url().slice(0, 100));
  }
});
await page.goto('https://x.com/intent/post?text=x-upload-' + Date.now(), { waitUntil: 'domcontentloaded' });
await new Promise(r => setTimeout(r, 4500));

// Take a "before" snapshot to baseline existing DOM
const before = await page.evaluate(() => ({
  progressBars: Array.from(document.querySelectorAll('[role="progressbar"]')).length,
  divsWithBg: Array.from(document.querySelectorAll('[style*="background-image"]')).length,
}));
console.log('before inject:', before);

// Inject (pass bytes as a JS array since b64 string had encoding issues)
await page.evaluate(async (bytes) => {
  const arr = new Uint8Array(bytes);
  const file = new File([arr], 'p.png', { type: 'image/png', lastModified: Date.now() });
  const dt = new DataTransfer(); dt.items.add(file);
  const input = document.querySelector('input[type="file"][accept*="image"]');
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'files').set;
  setter.call(input, dt.files);
  input.dispatchEvent(new Event('change', { bubbles: true }));
}, Array.from(png));

// Snapshot every 200ms for 6s, focusing on attachment area
const samples = [];
for (let i = 0; i < 30; i++) {
  await new Promise(r => setTimeout(r, 200));
  const s = await page.evaluate(() => {
    // Try to find the attachment/preview container
    const attachContainer = document.querySelector('[data-testid="attachments"]')
                            || document.querySelector('[data-testid="DraftEditorAttachments"]')
                            || document.querySelector('[aria-labelledby*="attach"]');

    // Or scope to all blob:images and look at their context
    const blobImgs = Array.from(document.querySelectorAll('img[src^="blob:"]'));
    const blobInfo = blobImgs.map(img => {
      let p = img.parentElement;
      const ancestors = [];
      while (p && ancestors.length < 4) {
        ancestors.push({
          tag: p.tagName,
          testid: p.getAttribute?.('data-testid'),
          aria: p.getAttribute?.('aria-label'),
          classSnip: p.className?.slice?.(0, 40),
          progressBars: p.querySelectorAll?.('[role="progressbar"]').length,
        });
        p = p.parentElement;
      }
      return { srcLen: img.src.length, ancestors };
    });

    // Look for circular progress indicators specifically (X uses SVG circles)
    const circles = Array.from(document.querySelectorAll('svg circle')).filter(c => {
      const stroke = c.getAttribute('stroke-dasharray') || c.getAttribute('stroke-dashoffset');
      return stroke; // animated circles have these
    }).length;

    // X's "uploading" indicator might use specific classes
    const uploadingHints = Array.from(document.querySelectorAll('[aria-label*="upload"], [aria-label*="processing"], [aria-busy]')).map(e => ({
      tag: e.tagName,
      aria: e.getAttribute('aria-label'),
      busy: e.getAttribute('aria-busy'),
    }));

    return {
      blobImgCount: blobImgs.length,
      blobInfo: blobInfo.slice(0, 2),
      animatedCircles: circles,
      uploadingHints,
      // Find pixel-style loading bars near attachments
      progressBars: Array.from(document.querySelectorAll('[role="progressbar"]')).map(p => ({
        ariaValueNow: p.getAttribute('aria-valuenow'),
        ariaValueMax: p.getAttribute('aria-valuemax'),
      })),
    };
  });
  samples.push({ t: i * 200, ...s });
}

// Print transition only
let prev = '';
for (const s of samples) {
  const key = JSON.stringify({
    blobImgCount: s.blobImgCount,
    animatedCircles: s.animatedCircles,
    uploadingHints: s.uploadingHints?.length ?? 0,
    progressBarCount: s.progressBars?.length ?? 0,
    progressVals: s.progressBars?.map(p => `${p.ariaValueNow}/${p.ariaValueMax}`).join(',') ?? '',
  });
  if (key !== prev) {
    console.log(`t+${s.t}ms`, key);
    prev = key;
  }
}

console.log('\nfirst/last blob ancestor info:');
if (samples[2]?.blobInfo?.length) {
  console.log('  early:', JSON.stringify(samples[2].blobInfo, null, 2));
}
if (samples[20]?.blobInfo?.length) {
  console.log('  late:', JSON.stringify(samples[20].blobInfo, null, 2));
}

await browser.disconnect();
