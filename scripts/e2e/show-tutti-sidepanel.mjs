import puppeteer from 'puppeteer-core';

const browser = await puppeteer.connect({
  browserURL: 'http://localhost:9222',
  protocolTimeout: 60000,
});
const pages = await browser.pages();
const extensionId = process.env.E2E_EXTENSION_ID ?? pages
  .map((page) => page.url().match(/^chrome-extension:\/\/([a-z]+)\//)?.[1])
  .find(Boolean);
if (!extensionId) throw new Error('Tutti extension id not found');

let page = pages.find((candidate) =>
  candidate.url() === `chrome-extension://${extensionId}/sidepanel.html`);
if (!page) {
  page = await browser.newPage();
  await page.goto(`chrome-extension://${extensionId}/sidepanel.html`, {
    waitUntil: 'domcontentloaded',
    timeout: 15000,
  });
}
await page.evaluate(async () => {
  const settings = (await chrome.storage.sync.get('settings'))['settings'] ?? {};
  await chrome.storage.sync.set({ settings: { ...settings, displayMode: 'auto' } });
});
await page.bringToFront();
console.log(`[show] Tutti sidepanel page opened (${extensionId}), displayMode=auto`);
browser.disconnect();
