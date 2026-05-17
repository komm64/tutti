/**
 * Surface 実機で IG Crop dialog の "Select crop" を click したときに出る
 * aspect ratio popover の DOM 構造を採取する probe。
 *
 * Tutti を経由せず puppeteer で直接 Create flow を進めて Crop dialog で停止、
 * popover の textContent / role / button 構造を snapshot する。
 */
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ws = (await (await fetch('http://localhost:9222/json/version')).json()).webSocketDebuggerUrl;
const browser = await puppeteer.connect({ browserWSEndpoint: ws, defaultViewport: null });

const pages = await browser.pages();
let ig = pages.find((p) => /instagram\.com/.test(p.url()));
if (!ig) ig = await browser.newPage();
await ig.bringToFront();
await ig.goto('https://www.instagram.com/', { waitUntil: 'domcontentloaded', timeout: 30000 });
await new Promise((r) => setTimeout(r, 4000));
await ig.keyboard.press('Escape').catch(() => {});
await new Promise((r) => setTimeout(r, 300));
await ig.keyboard.press('Escape').catch(() => {});
await new Promise((r) => setTimeout(r, 500));

// Create sidebar trigger を click (Professional account なので popover が出る)
const triggerClicked = await ig.evaluate(() => {
  const svg = document.querySelector('svg[aria-label="New post"]');
  const parent = svg?.closest('a, button, [role="link"], [role="button"]');
  if (parent) { parent.click(); return true; }
  return false;
});
console.log(`[probe] sidebar Create clicked: ${triggerClicked}`);
await new Promise((r) => setTimeout(r, 1500));

// popover の "Post" を選ぶ
const postClicked = await ig.evaluate(() => {
  const all = document.querySelectorAll('div[role="button"], button, a[role="link"], a[role="button"], [tabindex="0"]');
  for (const el of all) {
    if ((el.textContent || '').trim() === 'Post') { el.click(); return true; }
  }
  return false;
});
console.log(`[probe] popover "Post" clicked: ${postClicked}`);
await new Promise((r) => setTimeout(r, 2500));

// file input に画像を inject
const imagePath = resolve(process.cwd(), 'scripts/e2e/fixtures/test-image.jpg');
const fileInput = await ig.$('[role="dialog"] input[type="file"]');
if (!fileInput) {
  console.error('[probe] file input not found');
  browser.disconnect();
  process.exit(1);
}
await fileInput.uploadFile(imagePath);
console.log(`[probe] file uploaded`);
await new Promise((r) => setTimeout(r, 4000)); // Crop dialog mount 待ち

// Crop dialog 内の "Select crop" button を click
const cropOpened = await ig.evaluate(() => {
  const dialogs = Array.from(document.querySelectorAll('[role="dialog"]'));
  const cropDlg = dialogs.find((d) => /Crop/i.test(d.getAttribute('aria-label') || '')) || dialogs[dialogs.length - 1];
  if (!cropDlg) return { error: 'no crop dialog' };
  const cropBtn = Array.from(cropDlg.querySelectorAll('button, [role="button"]'))
    .find((b) => (b.textContent || '').trim() === 'Select crop');
  if (!cropBtn) return { error: 'Select crop button not found' };
  cropBtn.click();
  return { ok: true, dlgAria: cropDlg.getAttribute('aria-label') };
});
console.log(`[probe] Select crop clicked: ${JSON.stringify(cropOpened)}`);
await new Promise((r) => setTimeout(r, 1500));

// popover の中身を採取
const popoverSnap = await ig.evaluate(() => {
  // popover はクリッカブル menu や別 div で出ることがある
  // dialog 内の最新追加要素を網羅的に
  const dialogs = Array.from(document.querySelectorAll('[role="dialog"]'));
  const out = [];
  for (const d of dialogs) {
    const items = Array.from(d.querySelectorAll('button, [role="button"], [role="menuitem"], [role="radio"], [role="option"]'));
    const list = items.map((el) => {
      const t = (el.textContent || '').trim().slice(0, 50);
      const aria = el.getAttribute('aria-label') || '';
      const role = el.getAttribute('role') || el.tagName;
      const svgs = Array.from(el.querySelectorAll('svg[aria-label]')).map((s) => s.getAttribute('aria-label'));
      return { t, aria, role, svgs };
    }).filter((b) => b.t || b.aria || b.svgs.length);
    out.push({ dlgAria: d.getAttribute('aria-label') || '', items: list });
  }
  return out;
});
console.log(`[probe] popover snapshot:`);
console.log(JSON.stringify(popoverSnap, null, 2));

// dialog を閉じる (Escape ×3)
for (let i = 0; i < 3; i++) {
  await ig.keyboard.press('Escape').catch(() => {});
  await new Promise((r) => setTimeout(r, 400));
}
// "Discard" dialog が出たら "Discard" を押す
await ig.evaluate(() => {
  const dlgs = document.querySelectorAll('[role="dialog"]');
  for (const d of dlgs) {
    const btn = Array.from(d.querySelectorAll('button')).find((b) => (b.textContent || '').trim() === 'Discard');
    if (btn) btn.click();
  }
});
browser.disconnect();
