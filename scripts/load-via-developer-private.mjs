import puppeteer from 'puppeteer-core';
const browser = await puppeteer.connect({ browserURL: 'http://localhost:9222' });
const pages = await browser.pages();
let page = pages[0];

if (page.url() !== 'chrome://extensions/') {
  await page.goto('chrome://extensions/');
  await new Promise(r => setTimeout(r, 2000));
}

const result = await page.evaluate(() => {
  if (typeof chrome === 'undefined' || !chrome.developerPrivate) {
    return { error: 'chrome.developerPrivate not available' };
  }
  // Available methods?
  return {
    available: true,
    methods: Object.keys(chrome.developerPrivate).filter(k => typeof chrome.developerPrivate[k] === 'function'),
  };
});
console.log('developerPrivate:', JSON.stringify(result, null, 2));

await browser.disconnect();
