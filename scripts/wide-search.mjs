import puppeteer from 'puppeteer-core';
const browser = await puppeteer.connect({ browserURL: 'http://localhost:9222' });
const pages = await browser.pages();
const page = pages.find((p) => /tumblr\.com/.test(p.url())) ?? pages[0];
console.log('URL:', page.url());

const info = await page.evaluate(() => {
  // ren-fujimoto を含む文字列が DOM のどこにあるか全走査
  const occurrences = [];
  const re = /ren[-_]?fujimoto/i;
  // 1. text content
  const all = document.querySelectorAll('*');
  for (const el of all) {
    if (el.children.length === 0) {
      const t = el.textContent ?? '';
      if (re.test(t) && t.length < 100) {
        occurrences.push({ kind: 'text', tag: el.tagName, text: t.trim().slice(0, 80), parent: el.parentElement?.tagName });
        if (occurrences.length > 10) break;
      }
    }
  }
  // 2. attributes
  let attrCount = 0;
  for (const el of all) {
    if (attrCount >= 10) break;
    for (const attr of el.attributes ?? []) {
      if (re.test(attr.value)) {
        occurrences.push({ kind: 'attr', tag: el.tagName, attr: attr.name, value: attr.value.slice(0, 200) });
        attrCount++;
        if (attrCount >= 10) break;
      }
    }
  }

  // 3. all anchors with href starting "/" (filtered to non-article)
  const navAnchors = Array.from(document.querySelectorAll('a[href]'))
    .filter(a => !a.closest('article, [role="article"]'))
    .filter(a => {
      const h = a.getAttribute('href') ?? '';
      return h.startsWith('/') && h.length < 80;
    })
    .slice(0, 30)
    .map(a => ({ href: a.getAttribute('href'), text: a.textContent?.trim()?.slice(0, 40) }));

  return { occurrences, navAnchors, anchorCountTotal: document.querySelectorAll('a[href]').length };
});

console.log(JSON.stringify(info, null, 2));
await browser.disconnect();
