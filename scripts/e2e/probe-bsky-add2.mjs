import puppeteer from 'puppeteer-core';
const browser = await puppeteer.connect({ browserURL: 'http://localhost:9222', defaultViewport: null, protocolTimeout: 60000 });
const pages = await browser.pages();
let p = pages.find((page) => /bsky\.app/.test(page.url()));
if (!p) p = await browser.newPage();
await p.bringToFront();
await p.goto('https://bsky.app/intent/compose?text=hi', { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
await new Promise((r) => setTimeout(r, 5000));

const snap = await p.evaluate(() => {
  // composer / dialog 内の button だけ取る
  const composer = document.querySelector('[data-testid="composer"]')
    || document.querySelector('[role="dialog"]')
    || document.body;
  const allClickables = Array.from(composer.querySelectorAll('button, [role="button"]'));
  return allClickables.slice(0, 30).map((b) => ({
    tag: b.tagName,
    text: (b.textContent ?? '').slice(0, 30).trim(),
    aria: b.getAttribute('aria-label')?.slice(0, 50),
    testid: b.getAttribute('data-testid'),
    visible: !!(b.offsetWidth && b.offsetHeight),
    cls: b.className?.slice?.(0, 60),
  }));
});
console.log(JSON.stringify(snap, null, 2));

browser.disconnect();
