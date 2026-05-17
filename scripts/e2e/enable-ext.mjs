import puppeteer from 'puppeteer-core';
const ws = (await (await fetch('http://localhost:9222/json/version')).json()).webSocketDebuggerUrl;
const browser = await puppeteer.connect({ browserWSEndpoint: ws, defaultViewport: null });
const p = await browser.newPage();
await p.goto('chrome://extensions/', { timeout: 10000 });
await new Promise((r) => setTimeout(r, 2000));

// Step 1: dev mode を ON にする (toolbar の cr-toggle)
const devModeState = await p.evaluate(() => {
  const manager = document.querySelector('extensions-manager');
  const toolbar = manager?.shadowRoot?.querySelector('extensions-toolbar');
  const devToggle = toolbar?.shadowRoot?.querySelector('#devMode');
  if (!devToggle) return { error: 'devMode toggle not found' };
  const before = devToggle.checked;
  if (!before) devToggle.click();
  return { before, after: devToggle.checked };
});
console.log(`[enable-ext] devMode: ${JSON.stringify(devModeState)}`);
await new Promise((r) => setTimeout(r, 1500));

// Step 2: Tutti の toggle を click (cr-toggle は click() より dispatch が確実)
const enableState = await p.evaluate(() => {
  const manager = document.querySelector('extensions-manager');
  const itemList = manager?.shadowRoot?.querySelector('extensions-item-list');
  const items = itemList?.shadowRoot?.querySelectorAll('extensions-item');
  let found = null;
  items?.forEach((item) => {
    const name = item.shadowRoot?.querySelector('#name')?.textContent?.trim();
    if (name === 'Tutti') {
      const toggle = item.shadowRoot?.querySelector('#enableToggle');
      const before = toggle?.checked;
      // cr-toggle は内部に button を持つ。pointerdown / pointerup / click を順次 dispatch
      toggle?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      found = { name, before, afterImmediate: toggle?.checked };
    }
  });
  return found;
});
console.log(`[enable-ext] Tutti toggle: ${JSON.stringify(enableState)}`);
await new Promise((r) => setTimeout(r, 2000));

// Step 3: 最終状態を verify
const final = await p.evaluate(() => {
  const manager = document.querySelector('extensions-manager');
  const itemList = manager?.shadowRoot?.querySelector('extensions-item-list');
  const items = itemList?.shadowRoot?.querySelectorAll('extensions-item');
  const out = [];
  items?.forEach((item) => {
    const name = item.shadowRoot?.querySelector('#name')?.textContent?.trim();
    const id = item.id;
    const enabled = item.shadowRoot?.querySelector('#enableToggle')?.checked;
    const errorIcon = item.shadowRoot?.querySelector('.error-message');
    const errorText = errorIcon ? errorIcon.textContent?.trim() : null;
    out.push({ name, id, enabled, errorText });
  });
  return out;
});
console.log(`[enable-ext] final: ${JSON.stringify(final, null, 2)}`);
await p.close().catch(() => {});
browser.disconnect();
