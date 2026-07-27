import puppeteer from 'puppeteer-core';
import { connectPuppeteerCdp, disconnectCdp } from './cdp-harness.mjs';

const browser = await connectPuppeteerCdp({ puppeteer, timeoutMs: 60_000 });

for (const url of ['https://www.pixiv.net/', 'https://www.instagram.com/']) {
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
  console.log(`opened ${url}`);
  await new Promise((r) => setTimeout(r, 3000));
}

await disconnectCdp(browser);
