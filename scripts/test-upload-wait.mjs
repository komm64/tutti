// Verify: helper's upload wait actually delays response until /api/.../media* finished.
// Run dry-run (so we don't actually post) but observe inject helper's response timing
// vs upload network completion.
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'fs';
const browser = await puppeteer.connect({ browserURL: 'http://localhost:9222', protocolTimeout: 60000 });

const png = readFileSync('C:\\Users\\komm64\\AppData\\Local\\Temp\\tutti-test-100x100.png');

async function probe(label, url, mode, selector) {
  console.log(`\n=== ${label} ===`);
  for (const p of await browser.pages()) {
    if (p.url().includes(new URL(url).hostname)) await p.close();
  }
  const page = await browser.newPage();
  let lastUploadAt = 0;
  page.on('response', r => {
    if (/\b(upload|uploadBlob|drive\/files|api\/v\d+\/media)\b/i.test(r.url()) && r.request().method() !== 'GET') {
      console.log(`  [NET ${r.status()} ${r.request().method()}]`, r.url().slice(0, 80));
      if (r.ok()) lastUploadAt = Date.now();
    }
  });
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 4500));

  const t0 = Date.now();
  const result = await page.evaluate(async (bytes, mode, selector) => {
    const arr = new Uint8Array(bytes);
    const id = 'probe-' + Date.now();
    const promise = new Promise((resolve) => {
      const onMsg = (ev) => {
        if (ev.source !== window) return;
        const d = ev.data;
        if (d?.source === 'tutti-inject-res-v1' && d.id === id) {
          window.removeEventListener('message', onMsg);
          resolve(d);
        }
      };
      window.addEventListener('message', onMsg);
    });
    // Build base64 in browser
    let bin = '';
    for (let i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i]);
    const b64 = btoa(bin);
    window.postMessage({
      source: 'tutti-inject-req-v1',
      id, mode, selector,
      files: [{ name: 'wait.png', type: 'image/png', data: b64 }],
    }, '*');
    return await promise;
  }, Array.from(png), mode, selector);
  const t1 = Date.now();
  const respondedAt = t1 - t0;
  console.log(`  helper response: ${respondedAt}ms ${JSON.stringify(result)}`);
  if (lastUploadAt > 0) {
    const sinceLastUpload = t1 - lastUploadAt;
    console.log(`  (helper responded ${sinceLastUpload}ms after last successful upload)`);
  }
  await page.close();
}

await probe('X', 'https://x.com/intent/post?text=upload-wait', 'input', 'input[type="file"][accept*="image"]');
await probe('Mastodon', 'https://mastodon.social/share?text=upload-wait', 'input', '.compose-form input[type="file"], input[type="file"][multiple]');
await probe('Bluesky', 'https://bsky.app/intent/compose?text=upload-wait', 'drop', '[contenteditable="true"][role="textbox"], [data-testid="composer"]');
await probe('Misskey', 'https://misskey.io/share?text=upload-wait', 'drop', '[data-cy-post-form-text], textarea.text');
await probe('Threads', 'https://www.threads.com/intent/post?text=upload-wait', 'input', 'input[type="file"][accept*="image"]');
await probe('Tumblr', 'https://www.tumblr.com/new/text', 'drop', '[role="dialog"] .components-drop-zone, .components-drop-zone');

await browser.disconnect();
