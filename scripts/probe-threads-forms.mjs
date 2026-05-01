import puppeteer from 'puppeteer-core';
const browser = await puppeteer.connect({ browserURL: 'http://localhost:9222', protocolTimeout: 60000 });

for (const p of await browser.pages()) {
  if (/threads/.test(p.url())) await p.close();
}
const page = await browser.newPage();
await page.goto('https://www.threads.com/intent/post?text=threads-probe', { waitUntil: 'domcontentloaded' });
await new Promise(r => setTimeout(r, 5500));

const result = await page.evaluate(() => {
  const inputs = Array.from(document.querySelectorAll('input[type="file"]'));
  return {
    inputCount: inputs.length,
    inputs: inputs.map((inp, idx) => ({
      idx,
      accept: inp.accept,
      multiple: inp.multiple,
      inDialog: !!inp.closest('[role="dialog"]'),
      inMain: !!inp.closest('main'),
    })),
  };
});
console.log(JSON.stringify(result, null, 2));
await browser.disconnect();
