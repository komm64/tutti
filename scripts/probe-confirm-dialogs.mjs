// Probe: what buttons appear in Mastodon's alt-text + Tumblr's no-tags dialogs?
// Strategy: open each compose dialog, attach image (Mastodon) or text-only with no tag (Tumblr),
// click Post, and snapshot the dialog buttons that appear.
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'fs';
const browser = await puppeteer.connect({ browserURL: 'http://localhost:9222', protocolTimeout: 60000 });

const png = readFileSync('C:\\Users\\komm64\\AppData\\Local\\Temp\\tutti-test-100x100.png');
const b64 = png.toString('base64');

async function probeMastodon() {
  console.log('\n=== MASTODON ===');
  for (const p of await browser.pages()) {
    if (/mastodon\.social/.test(p.url())) await p.close();
  }
  const page = await browser.newPage();
  page.on('console', m => console.log(`[m]`, m.text().slice(0, 200)));
  await page.goto('https://mastodon.social/share?text=alt-confirm-' + Date.now(), { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 4000));
  // attach image via MAIN-world setter
  await page.evaluate(async (b64) => {
    const bin = atob(b64); const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    const file = new File([arr], 'p.png', { type: 'image/png', lastModified: Date.now() });
    const dt = new DataTransfer(); dt.items.add(file);
    const input = document.querySelector('.compose-form input[type="file"]');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'files').set;
    setter.call(input, dt.files);
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, b64);
  await new Promise(r => setTimeout(r, 4000));

  // click Post
  console.log('clicking Post...');
  await page.evaluate(() => {
    const btn = document.querySelector('button.button[type="submit"]');
    btn?.click();
  });
  await new Promise(r => setTimeout(r, 2000));

  // snapshot dialog
  const dialog = await page.evaluate(() => {
    const dialogs = Array.from(document.querySelectorAll('[role="dialog"], .modal-root__container, .modal-overlay'));
    return dialogs.map(d => ({
      tag: d.tagName,
      class: d.className?.slice?.(0, 80),
      text: d.innerText?.slice(0, 400),
      buttons: Array.from(d.querySelectorAll('button')).map(b => ({
        text: (b.textContent ?? '').trim().slice(0, 40),
        aria: b.getAttribute('aria-label'),
        class: b.className?.slice?.(0, 60),
        disabled: b.disabled,
      })),
    }));
  });
  console.log('mastodon dialog:', JSON.stringify(dialog, null, 2));
  await page.screenshot({ path: 'scripts/mastodon-alt-dialog.png' });
  await page.close();
}

async function probeTumblr() {
  console.log('\n=== TUMBLR ===');
  for (const p of await browser.pages()) {
    if (/tumblr\.com/.test(p.url())) await p.close();
  }
  const page = await browser.newPage();
  page.on('console', m => console.log(`[t]`, m.text().slice(0, 200)));
  await page.goto('https://www.tumblr.com/new/text', { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 5000));

  // type text in body
  await page.evaluate(() => {
    const eds = Array.from(document.querySelectorAll('[contenteditable="true"]'));
    const body = eds.find(e => e.tagName === 'P') || eds[1] || eds[0];
    if (body) { body.focus(); document.execCommand('insertText', false, 'tags-confirm-test'); }
  });
  await new Promise(r => setTimeout(r, 1500));

  // click Post now (no tags entered)
  console.log('clicking Post now...');
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => /Post now/i.test(b.textContent ?? '') && b.closest('[role="dialog"]'));
    btn?.click();
  });
  await new Promise(r => setTimeout(r, 2500));

  // snapshot all visible dialogs (Tumblr may show modal in portal)
  const dialogs = await page.evaluate(() => {
    const ds = Array.from(document.querySelectorAll('[role="dialog"], [role="alertdialog"], .components-modal__frame'));
    return ds.map(d => ({
      tag: d.tagName,
      class: d.className?.slice?.(0, 80),
      text: d.innerText?.slice(0, 400),
      buttons: Array.from(d.querySelectorAll('button')).map(b => ({
        text: (b.textContent ?? '').trim().slice(0, 50),
        aria: b.getAttribute('aria-label'),
        class: b.className?.slice?.(0, 60),
      })),
    }));
  });
  console.log('tumblr dialogs:', JSON.stringify(dialogs, null, 2));
  await page.screenshot({ path: 'scripts/tumblr-tags-dialog.png' });
  await page.close();
}

await probeMastodon();
await probeTumblr();

await browser.disconnect();
