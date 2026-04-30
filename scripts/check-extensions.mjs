import puppeteer from 'puppeteer-core';
const browser = await puppeteer.connect({ browserURL: 'http://localhost:9222' });

const targets = await browser.targets();
const exts = targets.filter((t) => t.url().startsWith('chrome-extension://'));
console.log('Extension targets:');
for (const t of exts) {
  console.log(`  type=${t.type()} url=${t.url().slice(0, 100)}`);
}

// Tumblr ページの content script で何が動いてるか確認
const pages = await browser.pages();
const page = pages.find((p) => /tumblr\.com/.test(p.url())) ?? pages[0];
const scripts = await page.evaluate(() => {
  return Array.from(document.querySelectorAll('script[src]'))
    .map((s) => s.src.slice(0, 100))
    .filter((s) => s.includes('chrome-extension'));
});
console.log('\nchrome-extension scripts in tumblr page:');
console.log(scripts);

await browser.disconnect();
