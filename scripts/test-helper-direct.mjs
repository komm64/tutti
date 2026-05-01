// Send postMessage directly to MAIN-world helper (no popup, no content script).
// Verifies whether the helper itself can inject + trigger Mastodon's reaction.
import puppeteer from 'puppeteer-core';

const browser = await puppeteer.connect({ browserURL: 'http://localhost:9222' });

for (const p of await browser.pages()) {
  if (/mastodon\.social/.test(p.url())) await p.close();
}

const page = await browser.newPage();
page.on('console', m => console.log(`[page ${m.type()}]`, m.text().slice(0, 200)));
page.on('pageerror', e => console.log('[page error]', e.message));
page.on('response', r => { if (!r.ok() && /\/api\/v\d/.test(r.url())) console.log(`[${r.status()}]`, r.url().slice(0, 100)); });

await page.goto('https://mastodon.social/share?text=helper-direct-test', { waitUntil: 'domcontentloaded' });
await new Promise(r => setTimeout(r, 4000));

// Use page.evaluate to send a postMessage from MAIN world (since this is page.evaluate, it runs in MAIN world)
// to the helper which is also in MAIN world. If the helper is properly registered, it should listen.
// Then we verify the inject works.
const png = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP8z8DwHwAFAAH/RU1ETAAAAABJRU5ErkJggg=='), c => c.charCodeAt(0));

const result = await page.evaluate(async (pngArr) => {
  // First check: is helper loaded? Look for our event listener... we can't probe that directly.
  // Send req, wait for response.
  const id = 'direct-' + Date.now();
  const buf = new Uint8Array(pngArr).buffer;

  const responsePromise = new Promise((resolve) => {
    const onMsg = (ev) => {
      if (ev.source !== window) return;
      const d = ev.data;
      if (d?.source === 'tutti-inject-res-v1' && d.id === id) {
        window.removeEventListener('message', onMsg);
        resolve(d);
      }
    };
    window.addEventListener('message', onMsg);
    setTimeout(() => { window.removeEventListener('message', onMsg); resolve({ timeout: true }); }, 4000);
  });

  window.postMessage({
    source: 'tutti-inject-req-v1',
    id,
    selector: '.compose-form input[type="file"], input[type="file"][multiple]',
    files: [{ name: 'direct.png', type: 'image/png', data: buf }],
  }, '*');

  return await responsePromise;
}, Array.from(png));

console.log('helper response:', JSON.stringify(result));

await new Promise(r => setTimeout(r, 5000));
const ui = await page.evaluate(() => ({
  fileCount: (document.querySelector('.compose-form input[type="file"]') || document.querySelector('input[type="file"][multiple]'))?.files?.length ?? 0,
  bodyText: document.querySelector('.compose-form')?.innerText?.slice(0, 300),
}));
console.log('UI 5s after inject:', JSON.stringify(ui, null, 2));

await page.screenshot({ path: 'scripts/helper-direct-test.png' });
await browser.disconnect();
