import puppeteer from 'puppeteer-core';
const browser = await puppeteer.connect({
  browserURL: 'http://localhost:9222',
  defaultViewport: null,
  protocolTimeout: 60000,
});
const pages = await browser.pages();
const igPage = pages.find((p) => /instagram\.com/.test(p.url())) || await browser.newPage();
await igPage.bringToFront();
const url = process.env.IG_POST_URL || 'https://www.instagram.com/ren.fujimoto.89/p/DYm7lEfE2Vm/';
await igPage.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
await new Promise((r) => setTimeout(r, 6000));
await igPage.screenshot({ path: 'C:/Users/komm64/Projects/tutti/scripts/e2e/ig-post-with-caption.png', fullPage: true });
console.log('saved');
browser.disconnect();
