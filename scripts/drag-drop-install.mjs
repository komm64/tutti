import puppeteer from 'puppeteer-core';
import { readdirSync, readFileSync, statSync } from 'fs';
import path from 'path';

const browser = await puppeteer.connect({ browserURL: 'http://localhost:9222' });
const pages = await browser.pages();
let page = pages.find((p) => p.url() === 'chrome://extensions/') ?? pages[0];
if (page.url() !== 'chrome://extensions/') {
  await page.goto('chrome://extensions/');
}
await new Promise(r => setTimeout(r, 2000));

// Walk extension dir and collect all files with relative paths
const extDir = 'C:\\Users\\komm64\\Projects\\tutti\\.output\\chrome-mv3';
function walk(dir, base = '') {
  const out = [];
  for (const ent of readdirSync(dir)) {
    const full = path.join(dir, ent);
    const rel = path.posix.join(base, ent);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...walk(full, rel));
    else out.push({ rel, content: readFileSync(full).toString('base64'), size: st.size });
  }
  return out;
}
const files = walk(extDir);
console.log(`packing ${files.length} files (${(files.reduce((a, f) => a + f.size, 0) / 1024).toFixed(1)} KB)`);

// Try the drag-drop API
const result = await page.evaluate(async (filesArg) => {
  const dt = new DataTransfer();
  for (const f of filesArg) {
    const bin = atob(f.content);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    const blob = new Blob([arr]);
    // File constructor with relative path "directory/file.ext" — Chrome treats as DirectoryEntry-like
    const file = new File([blob], f.rel, { type: 'application/octet-stream' });
    dt.items.add(file);
  }
  // Get drop target
  const root = document.querySelector('extensions-manager')?.shadowRoot;
  const dropTarget = root?.querySelector('extensions-drop-overlay') || root?.querySelector('extensions-item-list')?.shadowRoot?.querySelector('div') || document.body;
  const ev = new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true });
  dropTarget.dispatchEvent(ev);
  return { dropped: filesArg.length, target: dropTarget?.tagName };
}, files);
console.log('drop result:', result);

await new Promise(r => setTimeout(r, 3000));
const items = await page.evaluate(() => new Promise((r) => chrome.developerPrivate.getExtensionsInfo({ includeDisabled: true }, (i) => r(i?.length ?? 0))));
console.log('extension count after drop:', items);

await browser.disconnect();
