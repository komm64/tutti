// Check if logged into Tumblr in the running test Chrome.
import puppeteer from 'puppeteer-core';

const browser = await puppeteer.connect({
  browserURL: 'http://localhost:9222',
  defaultViewport: null,
});

const pages = await browser.pages();
console.log(`pages: ${pages.length}`);
for (const p of pages) {
  console.log(`  - ${p.url()}`);
}

let page = pages[0];
console.log('\nnavigating to tumblr.com/dashboard ...');
try {
  await page.goto('https://www.tumblr.com/dashboard', { waitUntil: 'domcontentloaded', timeout: 30000 });
} catch (e) {
  console.log('goto error:', e.message);
}

await new Promise((r) => setTimeout(r, 5000));

console.log('URL:', page.url());
console.log('title:', await page.title());

const isLoggedIn = !page.url().includes('/login') && !page.url().includes('/register');
console.log(`logged in: ${isLoggedIn}`);

if (!isLoggedIn) {
  console.log('\n!!! ログインしてないです。');
  console.log('現在の test Chrome window で tumblr.com にログインしてください。');
}

await browser.disconnect();
