import puppeteer from 'puppeteer-core';
const browser = await puppeteer.connect({ browserURL: 'http://localhost:9222' });

let pages = await browser.pages();
let page = pages[0];

const tuttiLogs = [];
page.on('console', (m) => {
  const t = m.text();
  if (t.includes('[Tutti]')) tuttiLogs.push(t);
});

console.log('navigating to tumblr.com/dashboard ...');
await page.goto('https://www.tumblr.com/dashboard', { waitUntil: 'domcontentloaded' });
console.log('current URL:', page.url());
console.log('current title:', await page.title());

// Wait for Tutti detection cycle (2.5s + 3 retries x 2s = ~8.5s + margin)
console.log('waiting 12s for Tutti content script...');
await new Promise(r => setTimeout(r, 12000));

console.log('\n[Tutti] logs collected:');
for (const log of tuttiLogs) console.log(' ', log.slice(0, 200));

await browser.disconnect();
