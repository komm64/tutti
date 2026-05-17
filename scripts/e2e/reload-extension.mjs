/**
 * Surface の Chromium 上の Tutti 拡張を CDP 経由で reload (新 build を反映)。
 * SW が idle なら先に popup.html navigate で wake してから chrome.runtime.reload()。
 */
import puppeteer from 'puppeteer-core';

const ws = (await (await fetch('http://localhost:9222/json/version')).json()).webSocketDebuggerUrl;
const browser = await puppeteer.connect({ browserWSEndpoint: ws, defaultViewport: null });

const EXT_ID = 'dophemlpjldcejjdjefpjbgngodopkfe';
async function findSw() {
  return browser.targets().find((t) => t.type() === 'service_worker' && t.url().includes(`chrome-extension://${EXT_ID}/`));
}

let sw = await findSw();
if (!sw) {
  console.log('[reload] SW idle, waking via popup.html');
  const p = await browser.newPage();
  try { await p.goto(`chrome-extension://${EXT_ID}/popup.html`, { timeout: 8000 }); } catch {}
  for (let i = 0; i < 50; i++) {
    sw = await findSw();
    if (sw) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  await p.close().catch(() => {});
}
if (!sw) { console.error('[reload] SW not found'); browser.disconnect(); process.exit(2); }

const worker = await sw.worker();
console.log('[reload] calling chrome.runtime.reload()');
await worker.evaluate(() => chrome.runtime.reload());
console.log('[reload] done');
browser.disconnect();
