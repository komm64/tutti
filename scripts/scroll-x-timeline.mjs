import puppeteer from 'puppeteer-core';
const browser = await puppeteer.connect({ browserURL: 'http://localhost:9222', protocolTimeout: 60000 });

for (const p of await browser.pages()) {
  if (/x\.com|twitter\.com/.test(p.url())) await p.close();
}
const page = await browser.newPage();
await page.goto('https://x.com/ren_fujimoto', { waitUntil: 'domcontentloaded' });
await new Promise(r => setTimeout(r, 6000));
await page.evaluate(() => window.scrollTo(0, 600));
await new Promise(r => setTimeout(r, 2000));

const posts = await page.evaluate(() => {
  return Array.from(document.querySelectorAll('article')).map(a => a.innerText.slice(0, 300));
});
console.log(JSON.stringify(posts, null, 2));
await page.screenshot({ path: 'C:/Users/komm64/Projects/tutti/scripts/x-timeline-scrolled.png' });
await browser.disconnect();
