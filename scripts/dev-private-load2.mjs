import puppeteer from 'puppeteer-core';
const browser = await puppeteer.connect({ browserURL: 'http://localhost:9222' });
const pages = await browser.pages();
let page = pages.find((p) => p.url() === 'chrome://extensions/') ?? pages[0];
if (page.url() !== 'chrome://extensions/') {
  await page.goto('chrome://extensions/');
  await new Promise(r => setTimeout(r, 2000));
}

// Try multiple load API variants
const result = await page.evaluate(() => {
  return new Promise((resolve) => {
    const out = {};
    // 1. Just call loadUnpacked with no path/options first to see what happens
    try {
      // Some implementations: loadUnpacked accepts a path string
      chrome.developerPrivate.loadUnpacked('C:\\Users\\komm64\\Projects\\tutti\\.output\\chrome-mv3', (err) => {
        out.loadUnpackedString = { err, lastError: chrome.runtime.lastError?.message };
        // 2. Try loadDirectory with path
        try {
          chrome.developerPrivate.loadDirectory('C:\\Users\\komm64\\Projects\\tutti\\.output\\chrome-mv3', (err2) => {
            out.loadDirectory = { err: err2, lastError: chrome.runtime.lastError?.message };
            resolve(out);
          });
        } catch (e2) {
          out.loadDirectoryThrew = String(e2);
          resolve(out);
        }
      });
      // Set a timeout in case loadUnpacked never calls back
      setTimeout(() => { out._timeout = true; resolve(out); }, 5000);
    } catch (e) {
      out.loadUnpackedThrew = String(e);
      resolve(out);
    }
  });
});
console.log(JSON.stringify(result, null, 2));

await browser.disconnect();
