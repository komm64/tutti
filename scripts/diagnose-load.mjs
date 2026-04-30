import puppeteer from 'puppeteer-core';
const browser = await puppeteer.connect({ browserURL: 'http://localhost:9222' });
const pages = await browser.pages();
let page = pages.find((p) => p.url() === 'chrome://extensions/') ?? pages[0];

// Listen to console for errors
page.on('console', (m) => console.log(`[page ${m.type()}]`, m.text()));
page.on('pageerror', (e) => console.log('[page error]', e.message));

await page.reload({ waitUntil: 'domcontentloaded' });
await new Promise(r => setTimeout(r, 2000));

// Check getExtensionsInfo + drawer/error state
const result = await page.evaluate(() => {
  return new Promise((resolve) => {
    chrome.developerPrivate.getExtensionsInfo({ includeDisabled: true, includeTerminated: true }, (items) => {
      // Also look for any error toast / banner in shadow DOM
      const root = document.querySelector('extensions-manager')?.shadowRoot;
      const toolbar = root?.querySelector('extensions-toolbar')?.shadowRoot;
      const drawer = root?.querySelector('extensions-drawer-loaded')?.innerHTML;
      const errors = root?.querySelector('extensions-error-page')?.innerHTML;
      const msg = root?.querySelector('cr-toast')?.innerHTML;
      // Body innerText
      const body = document.body.innerText;
      resolve({
        extCount: items?.length ?? 0,
        items: items,
        bodyText: body.slice(0, 500),
        toolbarHasError: toolbar?.innerHTML.includes('error') || false,
        toast: msg,
      });
    });
  });
});
console.log('\n=== state ===');
console.log(JSON.stringify(result, null, 2));

// Also print the value of chrome.runtime.lastError
const err = await page.evaluate(() => chrome.runtime?.lastError?.message ?? null);
console.log('\nchrome.runtime.lastError:', err);

await browser.disconnect();
