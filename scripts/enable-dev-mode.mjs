import puppeteer from 'puppeteer-core';
const browser = await puppeteer.connect({ browserURL: 'http://localhost:9222' });
const pages = await browser.pages();
let page = pages.find((p) => p.url() === 'chrome://extensions/') ?? pages[0];

if (page.url() !== 'chrome://extensions/') {
  await page.goto('chrome://extensions/');
  await new Promise(r => setTimeout(r, 2000));
}

// Developer mode toggle を click
const result = await page.evaluate(() => {
  // chrome://extensions は shadow DOM 多用
  const root = document.querySelector('extensions-manager')?.shadowRoot;
  if (!root) return { error: 'no extensions-manager' };
  const toolbar = root.querySelector('extensions-toolbar')?.shadowRoot;
  if (!toolbar) return { error: 'no toolbar shadow' };
  const toggle = toolbar.querySelector('#devMode');
  if (!toggle) return { error: 'no devMode toggle', html: toolbar.innerHTML.slice(0, 500) };
  toggle.click();
  return { ok: true, checked: toggle.checked };
});
console.log('toggle click result:', result);

await new Promise(r => setTimeout(r, 1500));
const path = 'C:/Users/komm64/Projects/tutti/scripts/extensions-after-toggle.png';
await page.screenshot({ path });
console.log('screenshot:', path);

await browser.disconnect();
