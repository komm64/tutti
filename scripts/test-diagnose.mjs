// Trigger the Diagnose button and verify the report is well-formed.
import puppeteer from 'puppeteer-core';
const EXT_ID = 'dophemlpjldcejjdjefpjbgngodopkfe';
const browser = await puppeteer.connect({ browserURL: 'http://localhost:9222', protocolTimeout: 60000 });

for (const p of await browser.pages()) {
  if (p.url().includes('popup.html')) await p.close();
}

const popup = await browser.newPage();
await popup.goto(`chrome-extension://${EXT_ID}/popup.html`);
await new Promise(r => setTimeout(r, 1500));

// Click "診断" button
await popup.evaluate(() => {
  const btn = Array.from(document.querySelectorAll('button')).find(b => /診断|Diagnose/.test(b.textContent ?? ''));
  if (!btn) throw new Error('no diagnose button');
  btn.click();
});

await new Promise(r => setTimeout(r, 5000));

const out = await popup.evaluate(() => {
  const pre = document.querySelector('pre');
  return pre?.textContent?.slice(0, 2000) ?? '(no <pre>)';
});
console.log('=== diagnostics output ===');
console.log(out);
await popup.screenshot({ path: 'scripts/diagnostics-result.png' });

await browser.disconnect();
