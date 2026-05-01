// Test if Tutti's image injection failure is timing or world isolation.
// Variant A: short wait (matching Tutti) from MAIN world → does it work?
// Variant B: long wait (4s) from MAIN world → confirmed works
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.connect({ browserURL: 'http://localhost:9222' });

async function test(label, waitMs) {
  console.log(`\n=== ${label} (wait ${waitMs}ms) ===`);
  const page = await browser.newPage();
  await page.goto('https://mastodon.social/share?text=' + label, { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, waitMs));
  const result = await page.evaluate(async () => {
    const png = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP8z8DwHwAFAAH/RU1ETAAAAABJRU5ErkJggg=='), c => c.charCodeAt(0));
    const file = new File([png], 'test.png', { type: 'image/png' });
    const dt = new DataTransfer();
    dt.items.add(file);
    const input = document.querySelector('.compose-form input[type="file"]') || document.querySelector('input[type="file"][multiple]');
    if (!input) return { error: 'no input' };
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'files')?.set;
    if (setter) setter.call(input, dt.files); else input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return { ok: true, fileCount: input.files?.length };
  });
  console.log('inject:', result);
  await new Promise(r => setTimeout(r, 4000));
  const ui = await page.evaluate(() => ({
    hasEdit: !!document.querySelector('.compose-form button[aria-label*="Edit"]'),
    hasAlt: !!document.querySelector('.compose-form button[aria-label*="ALT"]'),
    fileCount: document.querySelector('.compose-form input[type="file"]')?.files?.length ?? 0,
  }));
  console.log('UI 4s later:', ui);
  await page.close();
  return ui.hasEdit || ui.hasAlt;
}

const r1 = await test('long', 4000);
const r2 = await test('short', 800);
console.log(`\nlong(4s): ${r1 ? 'OK' : 'FAIL'}`);
console.log(`short(800ms): ${r2 ? 'OK' : 'FAIL'}`);

await browser.disconnect();
