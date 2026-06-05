import { chromium } from 'playwright';

const cdpEndpoint = process.env.E2E_CDP ?? 'http://localhost:9222';
const extensionId = process.env.E2E_EXTENSION_ID;

const browser = await chromium.connectOverCDP(cdpEndpoint);
const ctx = browser.contexts()[0];
const page = await ctx.newPage();
await page.goto('chrome://extensions/', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1000);
const info = await page.evaluate(async (wantedId) => {
  const getInfo = () => new Promise((resolve) => {
    chrome.developerPrivate.getExtensionsInfo({ includeDisabled: true, includeTerminated: true }, resolve);
  });
  const extensions = await getInfo();
  return extensions
    .filter((ext) => !wantedId || ext.id === wantedId || ext.name?.includes('Tutti'))
    .map((ext) => ({
      id: ext.id,
      name: ext.name,
      version: ext.version,
      location: ext.location,
      path: ext.path,
      installPath: ext.installPath,
      manifestHomePageUrl: ext.manifestHomePageUrl,
      state: ext.state,
      type: ext.type,
    }));
}, extensionId ?? null);
console.log(JSON.stringify(info, null, 2));
await page.close();
await browser.close();
