import puppeteer from 'puppeteer-core';
const browser = await puppeteer.connect({ browserURL: 'http://localhost:9222' });
const pages = await browser.pages();
let page = pages[0];
if (page.url() !== 'chrome://extensions/') {
  await page.goto('chrome://extensions/');
  await new Promise(r => setTimeout(r, 2000));
}

const result = await page.evaluate(() => {
  return new Promise((resolve) => {
    try {
      // loadDirectory needs a directory entry. We don't have a DirectoryEntry from JS easily.
      // Try loadUnpacked which opens picker but maybe we can pass options.
      // Some implementations: loadUnpacked({ failQuietly: true, populateError: true }, cb)
      chrome.developerPrivate.loadUnpacked(
        { failQuietly: true, populateError: true },
        (loadError) => {
          resolve({ method: 'loadUnpacked', loadError, lastError: chrome.runtime.lastError?.message });
        },
      );
    } catch (e) {
      resolve({ error: String(e) });
    }
  });
});
console.log('loadUnpacked result:', JSON.stringify(result, null, 2));

await browser.disconnect();
