import puppeteer from 'puppeteer-core';
const browser = await puppeteer.connect({ browserURL: 'http://localhost:9222' });
const pages = await browser.pages();
console.log('all tabs in test Chrome:');
for (const p of pages) {
  console.log(`  ${await p.title()} | ${p.url().slice(0, 80)}`);
}

let page = pages.find((p) => p.url() === 'chrome://extensions/') ?? pages[0];
if (page.url() !== 'chrome://extensions/') {
  await page.goto('chrome://extensions/');
  await new Promise(r => setTimeout(r, 1500));
}
await page.evaluate(() => {
  document.title = '★★ TUTTI TEST CHROME - Extensions ★★ ' + document.title;
});
await page.bringToFront();
console.log('\nMarked title. test Chrome の extensions ページが「★★」で始まっているはず。');
console.log('そのページで「Load unpacked」をクリック → C:\\Users\\komm64\\Projects\\tutti\\.output\\chrome-mv3 を選択');

await browser.disconnect();
