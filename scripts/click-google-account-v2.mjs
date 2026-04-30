import puppeteer from 'puppeteer-core';

const browser = await puppeteer.connect({
  browserURL: 'http://localhost:9222',
  defaultViewport: null,
});

const pages = await browser.pages();
const page = pages.find((p) => /accounts\.google\.com/.test(p.url())) ?? pages[0];

console.log('current URL:', page.url());

// 該当行の DOM 構造を調べる
const info = await page.evaluate(() => {
  const target = Array.from(document.querySelectorAll('*')).find((el) =>
    el.textContent === 'REDACTED@example.com',
  );
  if (!target) return { found: false };
  const ancestors = [];
  let cur = target;
  while (cur && ancestors.length < 8) {
    ancestors.push({
      tag: cur.tagName,
      role: cur.getAttribute?.('role'),
      dataIdentifier: cur.getAttribute?.('data-identifier'),
      jsname: cur.getAttribute?.('jsname'),
      jsaction: cur.getAttribute?.('jsaction')?.slice(0, 100),
      class: cur.getAttribute?.('class')?.slice(0, 80),
      id: cur.getAttribute?.('id'),
    });
    cur = cur.parentElement;
  }
  return { found: true, ancestors };
});
console.log('ancestors of email:', JSON.stringify(info, null, 2));

// click via mouse coordinates on the Ren Fujimoto row
const box = await page.evaluate(() => {
  const target = Array.from(document.querySelectorAll('*')).find((el) =>
    el.textContent === 'REDACTED@example.com',
  );
  if (!target) return null;
  // 親をたどってクリック可能な要素を探す
  let cur = target;
  while (cur) {
    const role = cur.getAttribute?.('role');
    const ja = cur.getAttribute?.('jsaction');
    const di = cur.getAttribute?.('data-identifier');
    if (role === 'link' || di || (ja && ja.includes('click'))) {
      const r = cur.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2, tag: cur.tagName };
    }
    cur = cur.parentElement;
  }
  return null;
});
console.log('clickable box:', box);

if (box) {
  await page.mouse.click(box.x, box.y);
  console.log('mouse clicked');
}

await new Promise((r) => setTimeout(r, 6000));
console.log('after URL:', page.url());

await browser.disconnect();
