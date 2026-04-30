import puppeteer from 'puppeteer-core';
const browser = await puppeteer.connect({ browserURL: 'http://localhost:9222' });
const pages = await browser.pages();
let page = pages.find((p) => p.url() === 'chrome://extensions/') ?? pages[0];
if (page.url() !== 'chrome://extensions/') {
  await page.goto('chrome://extensions/');
}
await page.reload();
await new Promise(r => setTimeout(r, 2000));

// Inspect installed extensions via shadow DOM
const info = await page.evaluate(() => {
  const root = document.querySelector('extensions-manager')?.shadowRoot;
  if (!root) return { error: 'no extensions-manager' };
  // Look at items list
  const items = root.querySelector('extensions-item-list')?.shadowRoot;
  if (!items) return { error: 'no item-list shadow' };
  const cards = items.querySelectorAll('extensions-item');
  return {
    count: cards.length,
    items: Array.from(cards).map((c) => {
      const sr = c.shadowRoot;
      return {
        name: sr?.querySelector('#name')?.textContent?.trim(),
        version: sr?.querySelector('#version')?.textContent?.trim(),
        id: c.getAttribute('id'),
      };
    }),
  };
});
console.log('extensions list:', JSON.stringify(info, null, 2));

// Also: targets
const targets = await browser.targets();
const exts = targets.filter((t) => t.url().startsWith('chrome-extension://'));
console.log('\nExtension targets via CDP:', exts.length);
for (const t of exts) console.log('  ', t.type(), t.url().slice(0, 80));

await browser.disconnect();
