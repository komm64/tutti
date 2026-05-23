import puppeteer from 'puppeteer-core';
const browser = await puppeteer.connect({ browserURL: 'http://localhost:9222', defaultViewport: null, protocolTimeout: 30000 });
const p = (await browser.pages()).find((page) => /x\.com/.test(page.url()));
if (!p) { console.log('no x tab'); process.exit(1); }
await p.bringToFront();
await new Promise((r) => setTimeout(r, 1500));
const snap = await p.evaluate(() => {
  const tas = Array.from(document.querySelectorAll('[data-testid^="tweetTextarea_"][contenteditable="true"]'));
  const addBtn = document.querySelector('[data-testid="addButton"]');
  const allBtns = Array.from(document.querySelectorAll('button, [role="button"]')).filter((b) => {
    const a = b.getAttribute('aria-label') ?? '';
    return /add/i.test(a) || /ポスト追加|ツイート追加|ポストを追加/i.test(a);
  });
  return {
    textareaCount: tas.length,
    texts: tas.map((t) => ({
      id: t.getAttribute('data-testid'),
      text: (t.textContent ?? '').slice(0, 80),
      marker: t.getAttribute('data-tutti-marker'),
    })),
    addBtn: addBtn ? {
      disabled: addBtn.hasAttribute('disabled') || addBtn.getAttribute('aria-disabled') === 'true',
      visible: !!(addBtn.offsetWidth && addBtn.offsetHeight),
      aria: addBtn.getAttribute('aria-label'),
    } : null,
    addBtnCandidates: allBtns.slice(0, 10).map((b) => ({
      tag: b.tagName,
      testid: b.getAttribute('data-testid'),
      aria: b.getAttribute('aria-label'),
      text: (b.textContent ?? '').slice(0, 30),
      visible: !!(b.offsetWidth && b.offsetHeight),
    })),
    images: document.querySelectorAll('[data-testid="attachments"] img, img[src^="blob:"]').length,
  };
});
console.log(JSON.stringify(snap, null, 2));
browser.disconnect();
