import puppeteer from 'puppeteer-core';

const browser = await puppeteer.connect({
  browserURL: 'http://localhost:9222',
  defaultViewport: null,
});

const pages = await browser.pages();
const page = pages.find((p) => /tumblr\.com/.test(p.url())) ?? pages[0];

await page.bringToFront();
const path = 'scripts/tumblr-screenshot.png';
await page.screenshot({ path, fullPage: false });
console.log('saved:', path);
console.log('URL:', page.url());
console.log('title:', await page.title());

await browser.disconnect();
