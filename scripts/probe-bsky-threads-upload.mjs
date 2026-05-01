// Capture ALL network requests during Bluesky / Threads image attach to find
// the actual upload URLs (so we can extend our regex).
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
  // log all non-GET requests + any POST/PUT
  const reqs = [];
  page.on('response', async r => {
    const req = r.request();
    const m = req.method();
    if (m === 'GET' || m === 'OPTIONS') return;
    const sz = (req.postData() ?? '').length;
    reqs.push({ status: r.status(), method: m, url: r.url().slice(0, 150), reqSize: sz });
  });
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 5000));

  const reqsBeforeInject = reqs.length;
  await page.evaluate(async (bytes, mode, selector) => {
    const arr = new Uint8Array(bytes);
    const id = 'probe-' + Date.now();
    const file = new File([arr], 'p.png', { type: 'image/png', lastModified: Date.now() });

    if (mode === 'input') {
      const input = document.querySelector(selector);
      if (!input) { console.log('NO INPUT for', selector); return; }
      const dt = new DataTransfer(); dt.items.add(file);
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'files').set;
      setter.call(input, dt.files);
      input.dispatchEvent(new Event('change', { bubbles: true }));
      input.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
      const target = document.querySelector(selector);
      if (!target) { console.log('NO TARGET for', selector); return; }
      const dt = new DataTransfer(); dt.items.add(file);
      const r = target.getBoundingClientRect();
      for (const t of ['dragenter', 'dragover', 'drop']) {
        const ev = new DragEvent(t, { bubbles: true, cancelable: true, dataTransfer: dt, clientX: r.left+r.width/2, clientY: r.top+r.height/2 });
        target.dispatchEvent(ev);
      }
    }
  }, Array.from(png), mode, selector);

  // wait 8s and capture all subsequent non-GET requests
  await new Promise(r => setTimeout(r, 8000));

  const newReqs = reqs.slice(reqsBeforeInject);
  console.log(`  ${newReqs.length} non-GET requests after inject:`);
  for (const r of newReqs.slice(0, 20)) {
    console.log(`    [${r.status} ${r.method}] ${r.url}${r.reqSize ? ` (${r.reqSize}B body)` : ''}`);
  }
  await page.close();
}

await probe('Bluesky', 'https://bsky.app/intent/compose?text=upload-trace', 'drop', '[contenteditable="true"][role="textbox"], [data-testid="composer"]');
await probe('Threads', 'https://www.threads.com/intent/post?text=upload-trace', 'input', 'input[type="file"][accept*="image"]');

await browser.disconnect();
