import puppeteer from 'puppeteer-core';
const browser = await puppeteer.connect({ browserURL: 'http://localhost:9222' });
const pages = await browser.pages();
let page = pages.find(p => /bsky\.app/.test(p.url())) ?? pages[0];

if (!/intent\/compose/.test(page.url())) {
  await page.goto('https://bsky.app/intent/compose?text=test', { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 1500));
}

// Find Add image button and inspect what happens before/after click
const before = await page.evaluate(() => {
  const all = document.querySelectorAll('input[type="file"]');
  const addImg = document.querySelector('[aria-label="Add image"]');
  return { fileInputs: all.length, addImgBtnExists: !!addImg, addImgTagName: addImg?.tagName };
});
console.log('before:', JSON.stringify(before));

// Click Add image button
const clicked = await page.evaluate(() => {
  const btn = document.querySelector('[aria-label="Add image"]');
  if (!btn) return false;
  btn.click();
  return true;
});
console.log('clicked add image:', clicked);
await new Promise(r => setTimeout(r, 1500));

const after = await page.evaluate(() => {
  const inputs = Array.from(document.querySelectorAll('input[type="file"]'));
  return {
    fileInputCount: inputs.length,
    inputs: inputs.map(i => ({
      accept: i.accept,
      multiple: i.multiple,
      visible: i.offsetParent !== null,
      ancestorTestids: (() => { const a=[]; let c=i; while(c){const t=c.getAttribute?.('data-testid'); if(t)a.push(t); c=c.parentElement;} return a; })(),
    })),
  };
});
console.log('after click:', JSON.stringify(after, null, 2));

// Also check if a popup/dropdown appeared with paste/from URL options
const popup = await page.evaluate(() => {
  const menus = document.querySelectorAll('[role="menu"], [role="dialog"]');
  return Array.from(menus).slice(0, 3).map(m => ({ role: m.getAttribute('role'), text: m.textContent?.slice(0, 200) }));
});
console.log('menus/dialogs:', JSON.stringify(popup, null, 2));

await page.screenshot({ path: 'scripts/bsky-after-click.png' });

await browser.disconnect();
