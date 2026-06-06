// Chrome Web Store Developer Dashboard を puppeteer で開いて screenshot を撮る。
// この session で Codex が画面を見て手順案内するためのもの。
import puppeteer from 'puppeteer-core';

const browser = await puppeteer.connect({
  browserURL: 'http://localhost:9222',
  protocolTimeout: 60000,
});

const pages = await browser.pages();
let page = pages.find((p) => p.url().includes('chrome.google.com/webstore/devconsole') || p.url().includes('chromewebstore.google.com/devconsole'));
if (!page) {
  page = await browser.newPage();
  await page.goto('https://chromewebstore.google.com/devconsole', { waitUntil: 'networkidle2', timeout: 30000 });
}
await new Promise((r) => setTimeout(r, 2500));
await page.screenshot({ path: 'scripts/cws-dashboard-state.png', fullPage: false });
console.log('current url:', page.url());
console.log('title:', await page.title());
await browser.disconnect();
