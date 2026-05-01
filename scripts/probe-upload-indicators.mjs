// During image upload, what DOM elements indicate "uploading" vs "ready"?
// Snapshot every 200ms after inject to find the transition signal per SNS.
import puppeteer from 'puppeteer-core';
import { readFileSync, writeFileSync } from 'fs';
const browser = await puppeteer.connect({ browserURL: 'http://localhost:9222', protocolTimeout: 60000 });

const png = readFileSync('C:\\Users\\komm64\\AppData\\Local\\Temp\\tutti-test-100x100.png');
const b64 = png.toString('base64');

async function probe(label, url, injectFn, fileInputSel) {
  console.log(`\n=== ${label} ===`);
  for (const p of await browser.pages()) {
    if (p.url().includes(new URL(url).hostname)) await p.close();
  }
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 4500));

  // Inject and immediately start polling
  await page.evaluate((b64, sel) => {
    const bin = atob(b64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    const file = new File([arr], 'p.png', { type: 'image/png', lastModified: Date.now() });
    const dt = new DataTransfer(); dt.items.add(file);
    const input = sel ? document.querySelector(sel) : null;
    if (input) {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'files').set;
      setter.call(input, dt.files);
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }
    window.__tuttiInjectedAt = Date.now();
  }, b64, fileInputSel);

  // poll DOM every 200ms for 8 seconds, capture changes
  const samples = [];
  for (let i = 0; i < 40; i++) {
    await new Promise(r => setTimeout(r, 200));
    const snap = await page.evaluate(() => {
      // Look for: progressbars / loading indicators / image previews / aria-busy / disabled buttons
      const progressBars = Array.from(document.querySelectorAll('[role="progressbar"], progress, .progress, .upload-progress, [aria-busy="true"]')).length;
      const blobImgs = Array.from(document.querySelectorAll('img[src^="blob:"]')).length;
      const httpImgs = Array.from(document.querySelectorAll('img[src^="https://"]')).filter(i => /upload|media|profile/i.test(i.src)).length;
      const editBtns = Array.from(document.querySelectorAll('button[aria-label*="Edit"], button[aria-label*="alt"], button[aria-label*="ALT"]')).length;
      const disabledPostBtn = (() => {
        // Find the post button in heuristic way - "Post" / "Tweet"
        const btns = Array.from(document.querySelectorAll('button[type="submit"], [data-testid="tweetButton"], [data-testid="tweetButtonInline"], [data-testid="composerPublishBtn"]'));
        if (btns.length === 0) return null;
        return btns[0].disabled || btns[0].getAttribute('aria-disabled') === 'true';
      })();
      // Capture spinner SVGs
      const spinners = Array.from(document.querySelectorAll('svg[aria-label], [class*="spinner"], [class*="Spinner"], [class*="loading"], [class*="Loading"]')).slice(0, 3).map(e => ({
        tag: e.tagName,
        aria: e.getAttribute?.('aria-label'),
        class: e.getAttribute('class')?.slice?.(0, 50),
      }));
      return { progressBars, blobImgs, httpImgs, editBtns, disabledPostBtn, spinners };
    }).catch(() => null);
    samples.push({ t: i * 200, ...snap });
  }

  console.log(`${label} timeline:`);
  let prev = null;
  for (const s of samples) {
    const sigKey = JSON.stringify({ progressBars: s.progressBars, blobImgs: s.blobImgs, httpImgs: s.httpImgs, editBtns: s.editBtns, disabledPostBtn: s.disabledPostBtn, spinnerCount: s.spinners?.length });
    if (sigKey !== prev) {
      console.log(`  t+${s.t}ms`, sigKey, s.spinners?.length > 0 ? `spinners:${JSON.stringify(s.spinners?.slice(0,2))}` : '');
      prev = sigKey;
    }
  }

  await page.close();
}

await probe('X', 'https://x.com/intent/post?text=upload-probe', null, 'input[type="file"][accept*="image"]');
await probe('Bluesky', 'https://bsky.app/intent/compose?text=upload-probe', null, null);  // bsky uses drop, skip inject
await probe('Mastodon', 'https://mastodon.social/share?text=upload-probe', null, '.compose-form input[type="file"]');
await probe('Threads', 'https://www.threads.com/intent/post?text=upload-probe', null, 'input[type="file"][accept*="image"]');

await browser.disconnect();
