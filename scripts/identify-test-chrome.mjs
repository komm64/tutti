import puppeteer from 'puppeteer-core';

const browser = await puppeteer.connect({
  browserURL: 'http://localhost:9222',
  defaultViewport: null,
});

const pages = await browser.pages();
console.log('現在のタブ:');
for (const p of pages) {
  console.log(`  ${p.url()}  |  ${await p.title()}`);
}

// Tumblr のタブを探す
let page = pages.find((p) => /tumblr\.com/.test(p.url()));
if (!page) {
  console.log('Tumblr のタブが無い、新規で開きます');
  page = await browser.newPage();
  await page.goto('https://www.tumblr.com/login', { waitUntil: 'domcontentloaded' });
}

// title をユニークにして識別しやすくする
await page.evaluate(() => {
  document.title = '★ TUTTI TEST CHROME ★ ' + document.title;
});
await page.bringToFront();

console.log('\nこの Chrome window (タイトルが "★ TUTTI TEST CHROME ★" 始まり) で Tumblr にログインしてください。');
console.log('閉じないでください。');

await browser.disconnect();
