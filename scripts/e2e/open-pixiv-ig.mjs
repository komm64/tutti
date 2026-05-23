import puppeteer from 'puppeteer-core';
const browser = await puppeteer.connect({ browserURL: 'http://localhost:9222', defaultViewport: null, protocolTimeout: 60000 });

for (const url of ['https://www.pixiv.net/', 'https://www.instagram.com/']) {
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
  console.log(`opened ${url}`);
  await new Promise((r) => setTimeout(r, 3000));
}

browser.disconnect();
