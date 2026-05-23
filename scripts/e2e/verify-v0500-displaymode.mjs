/**
 * v0.5.0 verify: displayMode 3 種が正しく setPanelBehavior + action.setPopup を切替えるか。
 *
 * 各 mode で settings を変えて → bg の applyDisplayModeBehavior を発火 → 効果を check:
 * - popup mode: action.getPopup() = 'popup.html'、 setPanelBehavior は false (推定)
 * - sidepanel: action.getPopup() = ''、 setPanelBehavior = true
 * - floating: action.getPopup() = ''、 setPanelBehavior は false
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

const popupPage = await browser.newPage();
await popupPage.goto(`chrome-extension://${EXT_ID}/popup.html`, { timeout: 8000 });
await new Promise((r) => setTimeout(r, 1500));

async function setMode(mode) {
  await popupPage.evaluate(async (mode) => {
    const { settings } = await chrome.storage.sync.get('settings');
    await chrome.storage.sync.set({ settings: { ...(settings ?? {}), displayMode: mode } });
  }, mode);
  // bg の onChanged listener で applyDisplayModeBehavior が発火するのを待つ
  await new Promise((r) => setTimeout(r, 800));
}

async function snapshot(label) {
  const popup = await worker.evaluate(async () => await chrome.action.getPopup({}));
  console.log(`[${label}] action.getPopup() = "${popup}"`);
}

for (const mode of ['popup', 'sidepanel', 'floating', 'popup']) {
  await setMode(mode);
  await snapshot(mode);
}

await popupPage.close().catch(() => {});
browser.disconnect();
