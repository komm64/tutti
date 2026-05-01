// IG caption editor の DOM 構造を確認。Wizard を進めて caption screen に到達してから snapshot。
import puppeteer from 'puppeteer-core';
import { writeFileSync, appendFileSync, readFileSync } from 'fs';

const LOG = 'scripts/ig-caption-probe.log';
writeFileSync(LOG, `=== ${new Date().toISOString()} ===\n`);
const log = (...a) => {
  const line = a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x, null, 2))).join(' ');
  appendFileSync(LOG, line + '\n');
  process.stdout.write(line + '\n');
};
process.on('uncaughtException', (e) => { log('UNCAUGHT', e.message); process.exit(1); });

const png = readFileSync('scripts/all-sns-mastodon.png');
const browser = await puppeteer.connect({ browserURL: 'http://localhost:9222', protocolTimeout: 240000 });
const page = await browser.newPage();
page.on('console', (m) => log('[page]', m.text().slice(0, 200)));

await page.goto('https://www.instagram.com/', { waitUntil: 'domcontentloaded', timeout: 30000 });
await new Promise((r) => setTimeout(r, 6000));

// Click Create
await page.evaluate(() => {
  const all = Array.from(document.querySelectorAll('a, button, [role="link"], [role="button"]'));
  const target = all.find((b) => /create/i.test((b.getAttribute('aria-label') ?? '') + ' ' + ((b.textContent ?? '').trim())));
  target?.click();
});
await new Promise((r) => setTimeout(r, 3500));

// inject file
await page.evaluate(async (bytes) => {
  const arr = new Uint8Array(bytes);
  const file = new File([arr], 't.png', { type: 'image/png', lastModified: Date.now() });
  const fi = document.querySelector('[role="dialog"] input[type="file"]');
  const dt = new DataTransfer(); dt.items.add(file);
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'files').set.call(fi, dt.files);
  fi.dispatchEvent(new Event('change', { bubbles: true }));
}, Array.from(png));
await new Promise((r) => setTimeout(r, 8000));

// Click Next twice (Crop → Edit → Caption)
for (let i = 0; i < 2; i++) {
  await page.evaluate(() => {
    const dlg = document.querySelector('[role="dialog"]');
    const next = dlg && Array.from(dlg.querySelectorAll('button, [role="button"]')).find((b) => /^Next$/.test((b.textContent ?? '').trim()));
    next?.click();
  });
  await new Promise((r) => setTimeout(r, 4000));
}

log('\n=== caption editor structure ===');
const ed = await page.evaluate(() => {
  // dialog 内の全 contenteditable と aria-label 持ち div
  const dlg = document.querySelector('[role="dialog"]');
  if (!dlg) return { err: 'no dialog' };
  const editables = Array.from(dlg.querySelectorAll('[contenteditable="true"], [contenteditable=""]')).map((el) => ({
    tag: el.tagName,
    contenteditable: el.getAttribute('contenteditable'),
    ariaLabel: el.getAttribute('aria-label'),
    role: el.getAttribute('role'),
    classNamePrefix: (el.className?.toString?.() ?? '').slice(0, 60),
    textContent: (el.textContent ?? '').slice(0, 40),
    innerText: (el.innerText ?? '').slice(0, 40),
    childCount: el.children.length,
    firstChildTag: el.children[0]?.tagName,
    firstChildHTML: el.children[0]?.outerHTML?.slice(0, 200),
  }));
  // aria-label "Write a caption" 持ち全要素
  const captionLabels = Array.from(dlg.querySelectorAll('[aria-label*="caption" i]')).map((el) => ({
    tag: el.tagName,
    contenteditable: el.getAttribute('contenteditable'),
    ariaLabel: el.getAttribute('aria-label'),
    classNamePrefix: (el.className?.toString?.() ?? '').slice(0, 60),
    parentTag: el.parentElement?.tagName,
    parentClass: (el.parentElement?.className?.toString?.() ?? '').slice(0, 60),
    descendantContenteditable: !!el.querySelector('[contenteditable="true"]'),
    isItself: el.getAttribute('contenteditable') === 'true',
  }));
  return { editables, captionLabels };
});
log(ed);

// 試しに caption editor に paste して見る
log('\n=== try paste & read multiple ways ===');
const pasteResult = await page.evaluate(async () => {
  const el = document.querySelector('[role="dialog"] [aria-label="Write a caption..."]');
  if (!el) return { err: 'no editor by aria-label' };
  el.focus?.();
  const dt = new DataTransfer();
  dt.setData('text/plain', 'PROBE_PASTE_TEXT');
  el.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: dt }));
  await new Promise((r) => setTimeout(r, 200));
  return {
    elTag: el.tagName,
    elIsContentEditable: el.isContentEditable,
    elContenteditable: el.getAttribute('contenteditable'),
    textContent: (el.textContent ?? '').slice(0, 60),
    innerText: ((el).innerText ?? '').slice(0, 60),
    childInnerText: el.children[0]?.innerText?.slice(0, 60),
    descendantText: Array.from(el.querySelectorAll('*')).map((c) => (c.textContent ?? '').slice(0, 30)).slice(0, 5),
  };
});
log(pasteResult);

await browser.disconnect();
log('done');
