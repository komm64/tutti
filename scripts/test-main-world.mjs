// Pure MAIN-world inject test (via puppeteer page.evaluate, no content script).
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.connect({ browserURL: 'http://localhost:9222' });

for (const p of await browser.pages()) {
  if (/mastodon\.social/.test(p.url())) await p.close();
}

const page = await browser.newPage();
await page.goto('https://mastodon.social/share?text=MAIN-world-test', { waitUntil: 'domcontentloaded' });
await new Promise(r => setTimeout(r, 4000));

const result = await page.evaluate(async () => {
  const png = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP8z8DwHwAFAAH/RU1ETAAAAABJRU5ErkJggg=='), c => c.charCodeAt(0));
  const file = new File([png], 'main.png', { type: 'image/png' });
  const dt = new DataTransfer();
  dt.items.add(file);
  const input = document.querySelector('.compose-form input[type="file"]') || document.querySelector('input[type="file"][multiple]');
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'files')?.set;
  if (setter) setter.call(input, dt.files); else input.files = dt.files;
  input.dispatchEvent(new Event('change', { bubbles: true }));
  return { fileCount: input.files?.length };
});
console.log('inject from MAIN:', result);

await new Promise(r => setTimeout(r, 5000));

const ui = await page.evaluate(() => ({
  hasEdit: !!document.querySelector('.compose-form button[aria-label*="Edit"]'),
  hasAlt: !!document.querySelector('.compose-form button[aria-label*="ALT"]'),
  hasRemove: !!document.querySelector('.compose-form button[aria-label*="Remove"]'),
  fileCount: (document.querySelector('.compose-form input[type="file"]') || document.querySelector('input[type="file"][multiple]'))?.files?.length ?? 0,
  bodyText: document.querySelector('.compose-form')?.innerText?.slice(0, 300),
}));
console.log('UI 5s after inject:', JSON.stringify(ui, null, 2));
await page.screenshot({ path: 'C:/Users/komm64/Projects/tutti/scripts/main-world-test.png' });

await browser.disconnect();
