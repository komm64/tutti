import puppeteer from 'puppeteer-core';
const browser = await puppeteer.connect({ browserURL: 'http://localhost:9222' });
const page = await browser.newPage();
await page.goto('https://www.tumblr.com/new/text', { waitUntil: 'domcontentloaded' });
await new Promise(r => setTimeout(r, 4000));

const info = await page.evaluate(() => {
  const editables = Array.from(document.querySelectorAll('[contenteditable="true"]'));
  const allFileInputs = Array.from(document.querySelectorAll('input[type="file"]'));
  const postNow = Array.from(document.querySelectorAll('button, [role="button"]')).find(b => /post now/i.test((b.textContent ?? '').trim()));

  return {
    editables: editables.slice(0, 5).map(e => ({
      tag: e.tagName,
      role: e.getAttribute('role'),
      testid: e.getAttribute('data-testid'),
      placeholder: e.getAttribute('placeholder') || e.getAttribute('aria-placeholder'),
      class: e.getAttribute('class')?.slice(0, 80),
      // ancestor with testid
      ancestorTestids: (() => { const a=[]; let c=e; while(c){const t=c.getAttribute?.('data-testid'); if(t)a.push(t); c=c.parentElement; if(a.length>=3)break;} return a; })(),
    })),
    allFileInputCount: allFileInputs.length,
    allFileInputs: allFileInputs.map(f => ({ accept: f.accept, multiple: f.multiple, ancestorTestids: (() => { const a=[]; let c=f; while(c){const t=c.getAttribute?.('data-testid'); if(t)a.push(t); c=c.parentElement;} return a; })() })),
    // Image / attachment buttons
    attachBtns: Array.from(document.querySelectorAll('button, [role="button"]'))
      .filter(b => {
        const aria = b.getAttribute('aria-label') ?? '';
        const t = (b.textContent ?? '').trim();
        return /image|photo|attach|gif|画像/i.test(aria + ' ' + t);
      })
      .slice(0, 8)
      .map(b => ({
        text: (b.textContent ?? '').trim().slice(0, 20),
        aria: b.getAttribute('aria-label'),
        testid: b.getAttribute('data-testid'),
      })),
    postNow: postNow ? {
      text: (postNow.textContent ?? '').trim().slice(0, 30),
      aria: postNow.getAttribute('aria-label'),
      testid: postNow.getAttribute('data-testid'),
      class: postNow.getAttribute('class')?.slice(0, 80),
      tag: postNow.tagName,
    } : null,
  };
});
console.log(JSON.stringify(info, null, 2));

await browser.disconnect();
