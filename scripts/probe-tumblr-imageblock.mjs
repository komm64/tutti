// Probe Tumblr's Image-block multi-step flow.
// Hypothesis: focus editor → block-type chooser appears → click Image →
// an image block mounts with its own input/dropzone. Find that.
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'fs';
const browser = await puppeteer.connect({ browserURL: 'http://localhost:9222', protocolTimeout: 120000 });

for (const p of await browser.pages()) {
  if (/tumblr\.com/.test(p.url())) await p.close();
}
const page = await browser.newPage();
page.on('console', m => console.log(`[page]`, m.text().slice(0, 250)));
await page.goto('https://www.tumblr.com/new/text', { waitUntil: 'domcontentloaded' });
await new Promise(r => setTimeout(r, 5000));

// Suppress all OS file pickers immediately
await page.evaluate(() => {
  const orig = HTMLInputElement.prototype.click;
  HTMLInputElement.prototype.click = function () {
    if (this.type === 'file') {
      console.log('[probe] suppressed file input.click():', this.outerHTML?.slice(0, 200));
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
    blockChooserBtns: Array.from(document.querySelectorAll('button[aria-label]'))
      .filter(b => /image|gif|link|audio|video|photo/i.test(b.getAttribute('aria-label') ?? ''))
      .slice(0, 12)
      .map(b => ({
        aria: b.getAttribute('aria-label'),
        text: (b.textContent ?? '').trim().slice(0, 30),
        class: b.className?.slice?.(0, 60),
      })),
    contentEditableCount: document.querySelectorAll('[contenteditable="true"]').length,
  }));
  console.log(`\n--- ${label} ---`);
  console.log(JSON.stringify(s, null, 2));
}

await snapshot('initial');

// Step 1: focus the body editor (not h1 title)
console.log('\n[step] focusing body p[contenteditable]');
const focused = await page.evaluate(() => {
  const eds = Array.from(document.querySelectorAll('[contenteditable="true"]'));
  const body = eds.find(e => e.tagName === 'P') || eds[1] || eds[0];
  if (!body) return false;
  body.focus();
  return body.outerHTML.slice(0, 200);
});
console.log('focused el:', focused);
await new Promise(r => setTimeout(r, 1000));
await snapshot('after focus');

// Step 2: try clicking "Image" block button (the one with red P icon)
console.log('\n[step] clicking aria-label="Image" button');
const clicked = await page.evaluate(() => {
  const btns = Array.from(document.querySelectorAll('button[aria-label="Image"]'));
  console.log(`[probe] ${btns.length} Image buttons found`);
  // The first 3 from earlier inspect were homepage-related; the one inside the dialog is the target.
  // Find the one inside [role="dialog"]
  const dialog = document.querySelector('[role="dialog"]');
  const candidate = btns.find(b => dialog?.contains(b)) || btns[btns.length - 1];
  if (!candidate) return { error: 'no Image button' };
  console.log('[probe] clicking:', candidate.outerHTML?.slice(0, 300));
  candidate.click();
  return { ok: true };
});
console.log('clicked:', clicked);
await new Promise(r => setTimeout(r, 2500));
await snapshot('after Image click');

// Step 3: also try simulating "+" toolbar to insert image block.
// Some Gutenberg builds have a "Add block" button when the editor is focused.
console.log('\n[step] looking for block inserter "+"');
const inserter = await page.evaluate(() => {
  const candidates = Array.from(document.querySelectorAll('button'))
    .filter(b => /add\s*block|insert\s*block|新規|追加|\+/i.test((b.getAttribute('aria-label') ?? '') + ' ' + (b.textContent ?? '')))
    .slice(0, 6)
    .map(b => ({ aria: b.getAttribute('aria-label'), text: (b.textContent ?? '').slice(0, 30), class: b.className?.slice?.(0, 60) }));
  return candidates;
});
console.log('inserter candidates:', inserter);

await page.screenshot({ path: 'scripts/tumblr-imageblock-probe.png' });
await browser.disconnect();
