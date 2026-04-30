// Bypass popup. Use any tab to send chrome.runtime.sendMessage to the extension's background.
import puppeteer from 'puppeteer-core';
import { writeFileSync } from 'fs';

const EXT_ID = 'dophemlpjldcejjdjefpjbgngodopkfe';
const browser = await puppeteer.connect({ browserURL: 'http://localhost:9222' });

// Set settings (dryRun = true)
const pages = await browser.pages();
const tab = pages.find(p => /https?:\/\//.test(p.url())) ?? pages[0];
await tab.evaluate((id) => new Promise((r) => chrome.runtime.sendMessage(id, { type: 'PING' }, () => r(chrome.runtime.lastError?.message ?? 'ok'))), EXT_ID).catch(() => {});

// Use chrome://extensions/ which has chrome.* APIs to set storage
const extPage = pages.find(p => p.url() === 'chrome://extensions/') ?? await (async () => { const p = await browser.newPage(); await p.goto('chrome://extensions/'); await new Promise(r => setTimeout(r, 1500)); return p; })();

// Hmm, chrome.storage only works in extension context. We need the popup or background.
// Try inspecting service worker target.
const allTargets = await browser.targets();
let swTarget = allTargets.find(t => t.type() === 'service_worker' && t.url().includes(EXT_ID));
if (!swTarget) {
  // wake it up by sending a message
  console.log('SW not found, trying to wake...');
}
console.log('all extension-related targets:');
for (const t of allTargets.filter(t => t.url().includes(EXT_ID))) {
  console.log('  type:', t.type(), 'url:', t.url().slice(0, 100));
}

// Try connect to SW
if (swTarget) {
  const worker = await swTarget.worker();
  const result = await worker.evaluate(() => new Promise((r) => chrome.storage.sync.set({ settings: { mastodonInstance: 'https://mastodon.social', misskeyInstance: 'https://misskey.io', dryRun: true } }, r)));
  console.log('settings set via SW:', result);

  // Trigger POST_REQUEST via service worker (background's onMessage handler)
  const postResult = await worker.evaluate(() => new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'POST_REQUEST', text: 'Tutti SW direct test ' + Date.now(), platforms: ['tumblr'], images: [] }, (response) => {
      resolve({ response, lastError: chrome.runtime.lastError?.message });
    });
  }));
  console.log('POST_REQUEST result:', JSON.stringify(postResult, null, 2));
}

await browser.disconnect();
