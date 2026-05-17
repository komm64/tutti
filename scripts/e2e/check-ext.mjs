// 拡張がそもそも load されてるか / どの extension ID か確認
import puppeteer from 'puppeteer-core';
const ws = (await (await fetch('http://localhost:9222/json/version')).json()).webSocketDebuggerUrl;
const browser = await puppeteer.connect({ browserWSEndpoint: ws, defaultViewport: null });

// 1) targets に SW / extension URL があるか
const targets = browser.targets();
console.log(`[check] total targets: ${targets.length}`);
for (const t of targets) {
  const url = t.url();
  if (url.includes('chrome-extension')) console.log(`  ext target: type=${t.type()} url=${url}`);
}

// 2) IG タブで chrome.runtime からマニフェストを取ってみる
const pages = await browser.pages();
const ig = pages.find((p) => /instagram\.com/.test(p.url()));
if (ig) {
  // MAIN world で content-script の global を覗く
  const tuttiMarkers = await ig.evaluate(() => ({
    helperInstalled: !!window.__tuttiUploadHookInstalled,
    upload: window.__tuttiUpload ?? null,
  }));
  console.log(`[check] IG main-world tutti markers: ${JSON.stringify(tuttiMarkers)}`);
}

// 3) chrome://extensions を puppeteer で開いて中身を見る
const p = await browser.newPage();
try {
  await p.goto('chrome://extensions/', { timeout: 8000 });
  await new Promise((r) => setTimeout(r, 2000));
  const exts = await p.evaluate(() => {
    const manager = document.querySelector('extensions-manager');
    const itemList = manager?.shadowRoot?.querySelector('extensions-item-list');
    if (!itemList) return { error: 'extensions-item-list not found' };
    const items = itemList.shadowRoot?.querySelectorAll('extensions-item');
    const out = [];
    items?.forEach((item) => {
      const name = item.shadowRoot?.querySelector('#name')?.textContent?.trim();
      const id = item.id;
      const enabled = item.shadowRoot?.querySelector('#enableToggle')?.checked;
      out.push({ name, id, enabled });
    });
    return out;
  });
  console.log(`[check] chrome://extensions: ${JSON.stringify(exts, null, 2)}`);
} catch (e) {
  console.log(`[check] chrome://extensions error: ${e.message}`);
}
await p.close().catch(() => {});
browser.disconnect();
