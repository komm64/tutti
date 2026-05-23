/**
 * Surface 環境で 何の API creds が設定されてるか確認。
 * Mastodon API path (alt/CW/visibility) の dummy verify を行う前に、
 * dummy test account が configured されてるかを check。
 */
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.connect({
  browserURL: 'http://localhost:9222',
  defaultViewport: null,
  protocolTimeout: 60000,
});
const EXT_ID = 'dophemlpjldcejjdjefpjbgngodopkfe';
let sw = browser.targets().find((t) => t.type() === 'service_worker' && t.url().includes(EXT_ID));
if (!sw) {
  const p = await browser.newPage();
  try { await p.goto(`chrome-extension://${EXT_ID}/popup.html`, { timeout: 8000 }); } catch {}
  for (let i = 0; i < 50; i++) {
    sw = browser.targets().find((t) => t.type() === 'service_worker' && t.url().includes(EXT_ID));
    if (sw) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  await p.close().catch(() => {});
}
const worker = await sw.worker();

const result = await worker.evaluate(async () => {
  const stored = await chrome.storage.local.get('apiCredentials');
  const creds = stored['apiCredentials'] ?? {};
  return {
    bluesky: creds.bluesky ? { identifier: creds.bluesky.identifier, hasPassword: !!creds.bluesky.appPassword } : null,
    mastodon: creds.mastodon ? { instance: creds.mastodon.instance, hasToken: !!creds.mastodon.accessToken } : null,
    misskey: creds.misskey ? { instance: creds.misskey.instance, hasToken: !!creds.misskey.accessToken } : null,
  };
});
console.log(JSON.stringify(result, null, 2));
browser.disconnect();
