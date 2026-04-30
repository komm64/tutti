import puppeteer from 'puppeteer-core';
const browser = await puppeteer.connect({ browserURL: 'http://localhost:9222' });
const pages = await browser.pages();
let page = pages.find(p => p.url() === 'chrome://extensions/');
if (!page) { page = await browser.newPage(); await page.goto('chrome://extensions/'); await new Promise(r => setTimeout(r, 1500)); }
const id = await page.evaluate(() => new Promise(r => chrome.developerPrivate.getExtensionsInfo({}, items => r(items?.[0]?.id ?? null))));
console.log('EXT_ID:', id);
await browser.disconnect();
