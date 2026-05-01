// v2: attach to existing Tumblr tab (opened via CDP HTTP) instead of newPage().
import puppeteer from 'puppeteer-core';
import { writeFileSync } from 'fs';
const browser = await puppeteer.connect({ browserURL: 'http://localhost:9222', protocolTimeout: 180000 });

const pages = await browser.pages();
let page = pages.find(p => /tumblr\.com\/new/.test(p.url()));
if (!page) {
  console.log('no Tumblr tab found, exiting'); process.exit(1);
}
console.log('attached to', page.url());
page.on('console', m => console.log(`[page]`, m.text().slice(0, 250)));

// Wait for editor ready
await new Promise(r => setTimeout(r, 5000));

// Suppress all OS file pickers
await page.evaluate(() => {
  const orig = HTMLInputElement.prototype.click;
  HTMLInputElement.prototype.click = function () {
    if (this.type === 'file') {
      console.log('[probe] suppressed file input.click()');
      return;
    }
    return orig.call(this);
  };
});

async function snapshot(label) {
  const s = await page.evaluate(() => ({
    fileInputs: Array.from(document.querySelectorAll('input[type="file"]')).map(f => ({
      accept: f.accept,
      multiple: f.multiple,
      attrs: Object.fromEntries(Array.from(f.attributes).map(a => [a.name, a.value])),
      parents: (() => { const a=[]; let n=f; while(n && a.length<6){ a.push(`${n.tagName}.${(n.className?.slice?.(0,40)) ?? ''}`); n=n.parentElement; } return a; })(),
    })),
    blockChooserBtns: Array.from(document.querySelectorAll('button'))
      .filter(b => /image|gif|link|audio|video|photo|chooser|insert/i.test(b.getAttribute('aria-label') ?? ''))
      .slice(0, 12)
      .map(b => ({
        aria: b.getAttribute('aria-label'),
        text: (b.textContent ?? '').trim().slice(0, 30),
        class: b.className?.slice?.(0, 60),
        rect: (() => { const r = b.getBoundingClientRect(); return [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)]; })(),
      })),
    contentEditableCount: document.querySelectorAll('[contenteditable="true"]').length,
    activeElement: { tag: document.activeElement?.tagName, role: document.activeElement?.getAttribute?.('role'), placeholder: document.activeElement?.getAttribute?.('aria-placeholder') },
    dialogChildren: (() => {
      const d = document.querySelector('[role="dialog"]');
      return d ? Array.from(d.querySelectorAll('button')).slice(0, 30).map(b => ({
        aria: b.getAttribute('aria-label'),
        text: (b.textContent ?? '').trim().slice(0, 25),
      })) : [];
    })(),
  }));
  console.log(`\n--- ${label} ---`);
  console.log(JSON.stringify(s, null, 2));
  return s;
}

await snapshot('initial');

// Step 1: focus body editable (not h1 title). Aim at p.
console.log('\n[step] focus body p');
await page.evaluate(() => {
  const eds = Array.from(document.querySelectorAll('[contenteditable="true"]'));
  const body = eds.find(e => e.tagName === 'P') || eds[1] || eds[0];
  if (body) { body.focus(); body.click(); }
});
await new Promise(r => setTimeout(r, 1500));
await snapshot('after focus body');

// Step 2: try clicking the inline "Image" mini-button (the one that appears in the popover after focus)
console.log('\n[step] click Image button inside dialog');
const clicked = await page.evaluate(() => {
  const dialog = document.querySelector('[role="dialog"]');
  if (!dialog) return { error: 'no dialog' };
  const btns = Array.from(dialog.querySelectorAll('button[aria-label]'));
  const imageBtn = btns.find(b => /^image$/i.test(b.getAttribute('aria-label') ?? ''));
  if (!imageBtn) return { error: 'no Image btn in dialog', candidates: btns.slice(0,15).map(b => b.getAttribute('aria-label')) };
  console.log('[probe] clicking Image:', imageBtn.outerHTML.slice(0, 250));
  const r = imageBtn.getBoundingClientRect();
  console.log('[probe] rect', r.x, r.y, r.width, r.height);
  imageBtn.click();
  return { ok: true, rect: [r.x, r.y, r.width, r.height] };
});
console.log('clicked:', clicked);
await new Promise(r => setTimeout(r, 3000));
await snapshot('after Image click');

await page.screenshot({ path: 'scripts/tumblr-after-image-block.png' });

// Step 3: collect all NEW elements that appeared. Look for dropzone divs / hidden inputs / placeholder buttons.
const newStuff = await page.evaluate(() => {
  // Look for "Add an image" / "Upload" / "Click to upload" type buttons
  const interesting = Array.from(document.querySelectorAll('button, label, div[role="button"], [data-testid]'))
    .filter(el => {
      const t = (el.textContent ?? '').slice(0, 80);
      const aria = el.getAttribute('aria-label') ?? '';
      const testid = el.getAttribute('data-testid') ?? '';
      return /upload|browse|click to|drag|drop|add an image|add image|choose file|computer|device|select/i.test(t + ' ' + aria + ' ' + testid);
    })
    .slice(0, 15)
    .map(el => ({
      tag: el.tagName,
      text: (el.textContent ?? '').slice(0, 80),
      aria: el.getAttribute('aria-label'),
      testid: el.getAttribute('data-testid'),
    }));
  // Also look for dropzone-like divs
  const dropzones = Array.from(document.querySelectorAll('[class*="ropzone"], [class*="ropZone"], [class*="rop-zone"], [aria-dropeffect]'))
    .slice(0, 10).map(el => ({ tag: el.tagName, class: el.className?.slice?.(0,80) }));
  return { interesting, dropzones };
});
console.log('newStuff:', JSON.stringify(newStuff, null, 2));

await browser.disconnect();
