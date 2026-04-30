// Connect to test Chrome, find tumblr tab, listen to console for [Tutti] tumblr logs.
import puppeteer from 'puppeteer-core';

const browser = await puppeteer.connect({ browserURL: 'http://localhost:9222' });

let pages = await browser.pages();
let page = pages.find((p) => /tumblr\.com/.test(p.url())) ?? pages[0];

console.log('listening on tumblr tab for [Tutti] console logs (max 25 sec)...');
console.log('current URL:', page.url());

const tuttiLogs = [];
page.on('console', (msg) => {
  const text = msg.text();
  if (text.includes('[Tutti]')) {
    tuttiLogs.push({ type: msg.type(), text });
    console.log(`  ${msg.type()}: ${text.slice(0, 200)}`);
  }
});

// reload to trigger fresh content script run
console.log('\nreloading page to trigger content script fresh...');
await page.reload({ waitUntil: 'domcontentloaded' });

// wait for the 2.5s + 3 retries of detectAndReportUser = ~8.5s, plus margin
await new Promise((r) => setTimeout(r, 22000));

console.log('\n--- final tutti logs collected:', tuttiLogs.length);
const success = tuttiLogs.find((l) => l.text.includes('detection succeeded'));
if (success) {
  console.log('\n✓ SUCCESS:', success.text);
} else {
  console.log('\n✗ no success line; check for failure dump above');
}

await browser.disconnect();
