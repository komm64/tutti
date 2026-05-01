// Test which event dispatch pattern actually triggers Mastodon's upload reaction.
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'fs';

const browser = await puppeteer.connect({ browserURL: 'http://localhost:9222' });
const page = await browser.newPage();

// Generate test PNG (small valid PNG)
const png = Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,0,0,0,0x0d,0x49,0x48,0x44,0x52,0,0,0,1,0,0,0,1,8,6,0,0,0,0x1f,0x15,0xc4,0x89,0,0,0,0x0d,0x49,0x44,0x41,0x54,0x78,0x9c,0x63,0xfc,0xcf,0xc0,0,0,0,3,0,1,0x46,0x4d,0x44,0x41,0,0,0,0,0x49,0x45,0x4e,0x44,0xae,0x42,0x60,0x82]);
const b64 = png.toString('base64');

await page.goto('https://mastodon.social/share?text=image-inject-test', { waitUntil: 'domcontentloaded' });
await new Promise(r => setTimeout(r, 4000));

const result = await page.evaluate(async (b64) => {
  // Get file input
  const input = document.querySelector('.compose-form input[type="file"]') || document.querySelector('input[type="file"][multiple]');
  if (!input) return { error: 'no file input' };
  // Build File
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  const blob = new Blob([arr], { type: 'image/png' });
  const file = new File([blob], 'test.png', { type: 'image/png', lastModified: Date.now() });

  const dt = new DataTransfer();
  dt.items.add(file);

  // Pattern A: native setter for files
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'files')?.set;
  if (setter) setter.call(input, dt.files);
  else input.files = dt.files;

  console.log('files set, count:', input.files?.length);

  // Try multiple events
  const events = [];
  // 1. change
  input.dispatchEvent(new Event('change', { bubbles: true }));
  events.push('change');
  // 2. input
  input.dispatchEvent(new Event('input', { bubbles: true }));
  events.push('input');

  return { ok: true, fileCount: input.files?.length, dispatched: events };
}, b64);
console.log('inject result:', result);

await new Promise(r => setTimeout(r, 4000));

// Check if image preview appeared in Mastodon UI
const ui = await page.evaluate(() => {
  // Mastodon attaches preview thumbnails. Look for img preview or upload spinner
  const previews = document.querySelectorAll('.compose-form .compose-form__upload, .compose-form img, .compose-form .upload-progress');
  const all = document.querySelectorAll('.compose-form > *');
  return {
    composeFormChildren: Array.from(all).slice(0, 10).map(c => ({ tag: c.tagName, class: c.className?.slice(0, 60) })),
    previewCount: previews.length,
    bodyText: document.querySelector('.compose-form')?.innerText?.slice(0, 500),
  };
});
console.log('UI state after inject:', JSON.stringify(ui, null, 2));
await page.screenshot({ path: 'C:/Users/komm64/Projects/tutti/scripts/mastodon-inject-test.png' });

// Try pattern B: drag-drop simulation
console.log('\n=== TRY DRAG-DROP ===');
const result2 = await page.evaluate(async (b64) => {
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  const blob = new Blob([arr], { type: 'image/png' });
  const file = new File([blob], 'test.png', { type: 'image/png', lastModified: Date.now() });
  const dt = new DataTransfer();
  dt.items.add(file);

  // Drop on textarea or compose-form
  const target = document.querySelector('.compose-form textarea') || document.querySelector('.compose-form');
  if (!target) return { error: 'no drop target' };

  for (const type of ['dragenter', 'dragover', 'drop']) {
    const ev = new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt });
    target.dispatchEvent(ev);
  }
  return { ok: true, target: target.tagName };
}, b64);
console.log('drop result:', result2);
await new Promise(r => setTimeout(r, 4000));
const ui2 = await page.evaluate(() => ({
  bodyText: document.querySelector('.compose-form')?.innerText?.slice(0, 500),
  imgCount: document.querySelectorAll('.compose-form img').length,
}));
console.log('after drop UI:', JSON.stringify(ui2, null, 2));
await page.screenshot({ path: 'C:/Users/komm64/Projects/tutti/scripts/mastodon-drop-test.png' });

await browser.disconnect();
