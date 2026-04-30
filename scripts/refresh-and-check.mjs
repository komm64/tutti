import puppeteer from 'puppeteer-core';
const browser = await puppeteer.connect({ browserURL: 'http://localhost:9222' });
const pages = await browser.pages();
const page = pages.find((p) => /tumblr\.com/.test(p.url())) ?? pages[0];

console.log('reloading...');
await page.reload({ waitUntil: 'domcontentloaded' });
console.log('waiting 12s for hydration...');
await new Promise((r) => setTimeout(r, 12000));

const info = await page.evaluate(() => {
  // ren-fujimoto を含む anything
  const html = document.documentElement.outerHTML;
  const idx = html.search(/ren[-_]fujimoto/i);
  if (idx < 0) return { found: false, htmlLen: html.length };

  // Find context around the match
  const start = Math.max(0, idx - 100);
  const ctx = html.slice(start, idx + 200);

  // /blog/ paths
  const blogLinks = Array.from(document.querySelectorAll('a[href*="/blog/"]'))
    .filter(a => !a.closest('article, [role="article"]'))
    .map(a => ({ href: a.getAttribute('href'), text: a.textContent?.trim()?.slice(0, 50) }));

  return { found: true, ctx, blogLinks: blogLinks.slice(0, 10) };
});

console.log(JSON.stringify(info, null, 2));
await browser.disconnect();
