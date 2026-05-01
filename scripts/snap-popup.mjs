import puppeteer from 'puppeteer-core';
const EXT_ID = 'dophemlpjldcejjdjefpjbgngodopkfe';
const browser = await puppeteer.connect({ browserURL: 'http://localhost:9222', protocolTimeout: 60000 });
for (const p of await browser.pages()) {
  if (p.url().includes('popup.html')) await p.close();
}
const popup = await browser.newPage();
await popup.goto(`chrome-extension://${EXT_ID}/popup.html`);
await new Promise(r => setTimeout(r, 1500));
await popup.screenshot({ path: 'C:/Users/komm64/Projects/tutti/scripts/popup-v048.png' });
await browser.disconnect();
