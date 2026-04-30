import puppeteer from 'puppeteer-core';
const browser = await puppeteer.connect({ browserURL: 'http://localhost:9222' });

const pages = await browser.pages();
let page = pages.find((p) => p.url() === 'chrome://extensions/') ?? pages[0];
if (page.url() !== 'chrome://extensions/') {
  await page.goto('chrome://extensions/');
  await new Promise(r => setTimeout(r, 2000));
}

const result = await page.evaluate(() => {
  return new Promise((resolve) => {
    chrome.developerPrivate.getExtensionsInfo({ includeDisabled: true, includeTerminated: true }, (items) => {
      resolve({
        count: items?.length ?? 0,
        items: items?.map((it) => ({
          id: it.id,
          name: it.name,
          version: it.version,
          state: it.state,
          path: it.path,
          location: it.location,
          disableReasons: it.disableReasons,
          installWarnings: it.installWarnings,
        })),
      });
    });
  });
});
console.log(JSON.stringify(result, null, 2));

await browser.disconnect();
