import puppeteer from 'puppeteer-core';
import {
  connectPuppeteerCdp,
  disconnectCdp,
  resolveExtensionId,
} from './cdp-harness.mjs';

const browser = await connectPuppeteerCdp({ puppeteer, timeoutMs: 60_000 });
const pages = await browser.pages();
const extensionId = await resolveExtensionId(browser);

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
await disconnectCdp(browser);
