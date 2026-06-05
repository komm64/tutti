import { chromium } from 'playwright';

const cdpEndpoint = process.env.E2E_CDP ?? 'http://localhost:9222';
const extensionId = process.env.E2E_EXTENSION_ID;
if (!extensionId) {
  console.error('E2E_EXTENSION_ID is required');
  process.exit(2);
}

const browser = await chromium.connectOverCDP(cdpEndpoint);
const ctx = browser.contexts()[0];
const page = await ctx.newPage();
await page.goto(`chrome-extension://${extensionId}/popup.html`, { waitUntil: 'domcontentloaded' });
const result = await page.evaluate(async () => {
  const bg = await fetch(chrome.runtime.getURL('background.js')).then((r) => r.text());
  const x = await fetch(chrome.runtime.getURL('content-scripts/x.js')).then((r) => r.text());
  return {
    backgroundHasComposePost: bg.includes('https://x.com/compose/post'),
    backgroundHasTabLog: bg.includes('navigating to'),
    backgroundHasHome: bg.includes('https://x.com/home'),
    xHasMainWorldClick: x.includes('mode:`click`') || x.includes('mode:"click"') || x.includes("mode:'click'"),
    xSelectorSnippet: x.match(/tweetTextarea_0.{0,120}/)?.[0] ?? null,
  };
});
console.log(JSON.stringify(result, null, 2));
await page.close();
await browser.close();
