import puppeteer from 'puppeteer-core';
const browser = await puppeteer.connect({ browserURL: 'http://localhost:9222', defaultViewport: null, protocolTimeout: 30000 });
const p = (await browser.pages()).find((page) => /x\.com/.test(page.url()));
if (!p) { console.log('no x tab'); process.exit(1); }
await p.bringToFront();
await new Promise((r) => setTimeout(r, 2000));
const snap = await p.evaluate(() => {
  const tas = Array.from(document.querySelectorAll('[data-testid^="tweetTextarea_"][contenteditable="true"]'));
  return tas.map((t) => ({
    id: t.getAttribute('data-testid'),
    text: (t.textContent ?? '').slice(0, 80),
  }));
});
console.log('X compose textareas:', JSON.stringify(snap, null, 2));
browser.disconnect();
