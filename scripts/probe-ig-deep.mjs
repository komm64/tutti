// IG modal を file inject してから wizard を最後まで追う probe。
import puppeteer from 'puppeteer-core';
import { writeFileSync, appendFileSync, readFileSync } from 'fs';

const LOG = 'scripts/ig-deep-probe.log';
writeFileSync(LOG, `=== ${new Date().toISOString()} ===\n`);
const log = (...a) => {
  const line = a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x, null, 2))).join(' ');
  appendFileSync(LOG, line + '\n');
  process.stdout.write(line + '\n');
};
process.on('uncaughtException', (e) => { log('UNCAUGHT', e.message); process.exit(1); });

// IG は 1KB 以上の画像が必要。既存スクショ (~25KB) を流用。
const png = readFileSync('scripts/all-sns-mastodon.png');

const browser = await puppeteer.connect({ browserURL: 'http://localhost:9222', protocolTimeout: 240000 });
const page = await browser.newPage();
page.on('console', (m) => log('[page]', m.text().slice(0, 200)));

await page.goto('https://www.instagram.com/', { waitUntil: 'domcontentloaded', timeout: 30000 });
await new Promise((r) => setTimeout(r, 6000));

log('clicking Create');
await page.evaluate(() => {
  const all = Array.from(document.querySelectorAll('a, button, [role="link"], [role="button"]'));
  const target = all.find((b) => /create/i.test((b.getAttribute('aria-label') ?? '') + ' ' + ((b.textContent ?? '').trim())));
  target?.click();
});
await new Promise((r) => setTimeout(r, 3500));

async function snap(label) {
  const data = await page.evaluate(() => {
    const dlg = document.querySelector('[role="dialog"]');
    const buttons = dlg ? Array.from(dlg.querySelectorAll('button, [role="button"]')).map((b) => ({
      text: (b.textContent ?? '').trim().slice(0, 40),
      aria: b.getAttribute('aria-label'),
      disabled: b.disabled || b.getAttribute('aria-disabled') === 'true',
    })).slice(0, 12) : [];
    const editors = dlg ? Array.from(dlg.querySelectorAll('input[type="text"], textarea, [contenteditable="true"]')).map((el) => ({
      tag: el.tagName,
      type: el.getAttribute('type'),
      ariaLabel: el.getAttribute('aria-label'),
      placeholder: el.getAttribute('placeholder'),
      contentEditable: el.getAttribute('contenteditable'),
    })) : [];
    const headings = dlg ? Array.from(dlg.querySelectorAll('h1, h2, h3, [role="heading"]')).map((h) => (h.textContent ?? '').trim().slice(0, 50)) : [];
    return {
      hasDialog: !!dlg,
      headings,
      buttons,
      editors,
      dialogText: dlg?.textContent?.trim().slice(0, 150),
    };
  });
  log(`\n=== ${label} ===`);
  log(data);
  return data;
}

await snap('after Create');

log('\n[inject PNG into dialog file input]');
const injectResult = await page.evaluate(async (bytes) => {
  const arr = new Uint8Array(bytes);
  const file = new File([arr], 'test.png', { type: 'image/png', lastModified: Date.now() });
  const fi = document.querySelector('[role="dialog"] input[type="file"]');
  if (!fi) return { ok: false, err: 'no file input in dialog' };
  const dt = new DataTransfer(); dt.items.add(file);
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'files').set;
  setter.call(fi, dt.files);
  fi.dispatchEvent(new Event('change', { bubbles: true }));
  fi.dispatchEvent(new Event('input', { bubbles: true }));
  return { ok: true };
}, Array.from(png));
log('inject:', injectResult);

await new Promise((r) => setTimeout(r, 7000));
await snap('after file inject (crop screen?)');

// Find Next button + click
log('\n[click Next #1]');
const click1 = await page.evaluate(() => {
  const dlg = document.querySelector('[role="dialog"]');
  if (!dlg) return { ok: false };
  const next = Array.from(dlg.querySelectorAll('button, [role="button"]')).find((b) =>
    /^Next$|^次へ$/i.test((b.textContent ?? '').trim())
  );
  if (!next) return { ok: false, err: 'no Next' };
  next.click();
  return { ok: true };
});
log(click1);
await new Promise((r) => setTimeout(r, 4000));
await snap('after Next #1 (filter screen?)');

log('\n[click Next #2]');
const click2 = await page.evaluate(() => {
  const dlg = document.querySelector('[role="dialog"]');
  const next = dlg ? Array.from(dlg.querySelectorAll('button, [role="button"]')).find((b) =>
    /^Next$|^次へ$/i.test((b.textContent ?? '').trim())
  ) : null;
  if (!next) return { ok: false };
  next.click();
  return { ok: true };
});
log(click2);
await new Promise((r) => setTimeout(r, 4000));
await snap('after Next #2 (caption screen?)');

await page.screenshot({ path: 'scripts/ig-deep-probe.png', fullPage: false });
await browser.disconnect();
log('done');
