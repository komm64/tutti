// Reload Tutti extension AND reload all SNS tabs (content scripts on existing
// tabs are NOT auto-replaced when extension reloads — only fresh navigations
// pick up the new code). Without this, you'd test against stale content script.
import puppeteer from 'puppeteer-core';
const EXT_ID = 'dophemlpjldcejjdjefpjbgngodopkfe';
const SNS_RE = /^https:\/\/(x\.com|twitter\.com|bsky\.app|.*threads\.(net|com)|mastodon\.social|misskey\.io|.*tumblr\.com|.*pixiv\.net|.*deviantart\.com)\//;

const browser = await puppeteer.connect({ browserURL: 'http://localhost:9222', protocolTimeout: 240000 });
const pages = await browser.pages();
let extPage = pages.find(p => p.url() === 'chrome://extensions/');
if (!extPage) {
  extPage = await browser.newPage();
  await extPage.goto('chrome://extensions/');
  await new Promise(r => setTimeout(r, 1500));
}

const result = await extPage.evaluate((id) => new Promise((resolve) => {
  chrome.developerPrivate.reload(id, {}, () => {
    resolve(chrome.runtime.lastError?.message ?? 'reloaded');
  });
}), EXT_ID);
console.log('extension:', result);

// Reload SNS tabs so they pick up new content scripts
const snsTabs = (await browser.pages()).filter(p => SNS_RE.test(p.url()));
for (const tab of snsTabs) {
  try {
    await tab.reload({ waitUntil: 'domcontentloaded', timeout: 8000 });
    console.log('reloaded SNS tab:', tab.url().slice(0, 80));
  } catch (e) {
    console.log('reload failed:', tab.url().slice(0, 60), e.message);
  }
}

await browser.disconnect();
