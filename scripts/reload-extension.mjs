import puppeteer from 'puppeteer-core';
const EXT_ID = 'dophemlpjldcejjdjefpjbgngodopkfe';
const browser = await puppeteer.connect({ browserURL: 'http://localhost:9222' });
const pages = await browser.pages();
let page = pages.find(p => p.url() === 'chrome://extensions/');
if (!page) { page = await browser.newPage(); await page.goto('chrome://extensions/'); await new Promise(r => setTimeout(r, 1500)); }

const result = await page.evaluate((id) => new Promise((resolve) => {
  chrome.developerPrivate.reload(id, {}, () => {
    resolve(chrome.runtime.lastError?.message ?? 'reloaded');
  });
}), EXT_ID);
console.log('reload result:', result);

await browser.disconnect();
