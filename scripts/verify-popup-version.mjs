import puppeteer from 'puppeteer-core';
const browser = await puppeteer.connect({ browserURL: 'http://localhost:9222', protocolTimeout: 60000 });
const popup = (await browser.pages()).find(p => p.url().endsWith('popup.html'));
if (!popup) { console.log('no popup'); process.exit(1); }
await new Promise(r => setTimeout(r, 1500));
const v = await popup.evaluate(() => {
  const versionTexts = Array.from(document.querySelectorAll('*'))
    .filter(e => /v\d+\.\d+\.\d+/.test(e.textContent ?? ''))
    .map(e => e.textContent?.trim().slice(0, 40))
    .filter((v, i, arr) => arr.indexOf(v) === i)
    .slice(0, 5);
  const manifestVersion = chrome.runtime.getManifest().version;
  return { manifestVersion, versionTexts };
});
console.log(JSON.stringify(v, null, 2));
await browser.disconnect();
