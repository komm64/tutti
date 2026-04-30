import puppeteer from 'puppeteer-core';
const browser = await puppeteer.connect({ browserURL: 'http://localhost:9222' });
const pages = await browser.pages();
const page = pages.find((p) => /tumblr\.com/.test(p.url())) ?? pages[0];
console.log('URL:', page.url());
console.log('title:', await page.title());
const info = await page.evaluate(() => {
  const all = Array.from(document.querySelectorAll('a[href^="/blog/"]'));
  return {
    count: all.length,
    samples: all.slice(0, 15).map((a) => ({
      href: a.getAttribute('href'),
      inArticle: !!a.closest('article, [role="article"]'),
      ancestor: (() => {
        let cur = a;
        const tags = [];
        while (cur && tags.length < 8) { tags.push(cur.tagName + (cur.className ? '.' + String(cur.className).slice(0, 30) : '')); cur = cur.parentElement; }
        return tags.join(' > ');
      })(),
      text: a.textContent?.trim()?.slice(0, 50),
    })),
  };
});
console.log(JSON.stringify(info, null, 2));
await browser.disconnect();
