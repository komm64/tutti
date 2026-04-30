import puppeteer from 'puppeteer-core';
const browser = await puppeteer.connect({ browserURL: 'http://localhost:9222' });
const pages = await browser.pages();
const page = pages[0];
try {
  await page.goto('chrome://extensions/', { waitUntil: 'domcontentloaded', timeout: 10000 });
} catch (e) {
  console.log('goto error:', e.message);
}
await new Promise((r) => setTimeout(r, 3000));
console.log('URL:', page.url());
const path = 'C:/Users/komm64/Projects/tutti/scripts/extensions-page.png';
await page.screenshot({ path });
console.log('screenshot:', path);
const html = await page.evaluate(() => document.body.innerText.slice(0, 2000));
console.log('body text:');
console.log(html);
await browser.disconnect();
