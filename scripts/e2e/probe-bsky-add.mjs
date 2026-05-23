import puppeteer from 'puppeteer-core';
const browser = await puppeteer.connect({ browserURL: 'http://localhost:9222', defaultViewport: null, protocolTimeout: 60000 });
const pages = await browser.pages();
const p = pages.find((page) => /bsky\.app/.test(page.url()));
if (!p) { console.log('no bsky'); process.exit(1); }
await p.bringToFront();
await new Promise((r) => setTimeout(r, 2000));

const snap = await p.evaluate(() => {
  const buttons = Array.from(document.querySelectorAll<HTMLElement>('button, [role="button"]')).slice(0, 50);
  return buttons.map((b) => ({
    tag: b.tagName,
    text: (b.textContent ?? '').slice(0, 30).trim(),
    aria: b.getAttribute('aria-label')?.slice(0, 50),
    testid: b.getAttribute('data-testid'),
    visible: !!(b.offsetWidth && b.offsetHeight),
  })).filter((b) => b.visible && (b.aria || b.testid || (b.text && b.text.length < 30)));
});
console.log(JSON.stringify(snap, null, 2));
browser.disconnect();
