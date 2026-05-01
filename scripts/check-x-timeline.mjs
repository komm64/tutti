// Check ren_fujimoto's recent X posts for the test post.
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.connect({ browserURL: 'http://localhost:9222', protocolTimeout: 90000 });

for (const p of await browser.pages()) {
  if (/x\.com|twitter\.com/.test(p.url())) await p.close();
}
const page = await browser.newPage();
await page.goto('https://x.com/ren_fujimoto', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise(r => setTimeout(r, 8000));

const state = await page.evaluate(() => {
  const articles = Array.from(document.querySelectorAll('article'));
  return {
    totalArticles: articles.length,
    first5: articles.slice(0, 5).map(a => ({
      text: a.innerText.slice(0, 200),
      hasImg: !!a.querySelector('img[alt][src*="media"]'),
    })),
  };
});
console.log(JSON.stringify(state, null, 2));
await page.screenshot({ path: 'C:/Users/komm64/Projects/tutti/scripts/x-timeline-check.png' });
await browser.disconnect();
