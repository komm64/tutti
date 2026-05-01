import puppeteer from 'puppeteer-core';
const browser = await puppeteer.connect({ browserURL: 'http://localhost:9222' });
const pages = await browser.pages();
let page = pages.find((p) => p.url() === 'chrome://extensions/') ?? pages[0];
if (page.url() !== 'chrome://extensions/') {
  await page.goto('chrome://extensions/');
}
await new Promise(r => setTimeout(r, 1500));
const path = 'scripts/extensions-current.png';
await page.screenshot({ path, fullPage: false });
console.log('saved:', path);
console.log('URL:', page.url());
console.log('title:', await page.title());

// ほかの window の情報も(別 user-data-dir の Chrome は見えないが)
const all = await browser.pages();
console.log('\nall test Chrome tabs:');
for (const p of all) {
  console.log(`  ${(await p.title()).slice(0, 50)} | ${p.url().slice(0, 80)}`);
}
await browser.disconnect();
