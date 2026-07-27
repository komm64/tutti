import puppeteer from 'puppeteer-core';
import { connectPuppeteerCdp, disconnectCdp, resolveExtensionId } from './e2e/cdp-harness.mjs';
const browser = await connectPuppeteerCdp({ puppeteer, browserURL: 'http://localhost:9222', protocolTimeout: 60000 });
const EXT_ID = await resolveExtensionId(browser);
for (const p of await browser.pages()) {
  if (p.url().includes('popup.html')) await p.close();
}
const popup = await browser.newPage();
await popup.goto(`chrome-extension://${EXT_ID}/popup.html`);
await new Promise(r => setTimeout(r, 1500));
// Simulate partial login: keep X / Threads / Mastodon, remove others
await popup.evaluate(() => new Promise(r => chrome.storage.local.set({
  lastSeenUsers: { x: '@ren_fujimoto', threads: '@ren.fujimoto.89', mastodon: '@ren_fujimoto' }
}, r)));
await popup.reload();
await new Promise(r => setTimeout(r, 1500));
await popup.screenshot({ path: 'scripts/popup-section-split.png' });

// restore
await popup.evaluate(() => new Promise(r => chrome.storage.local.set({
  lastSeenUsers: { x: '@ren_fujimoto', bluesky: '@ren-fujimoto89.bsky.social', threads: '@ren.fujimoto.89', mastodon: '@ren_fujimoto', misskey: '@ren_fujimoto', tumblr: '@ren-fujimoto' }
}, r)));
await disconnectCdp(browser);
