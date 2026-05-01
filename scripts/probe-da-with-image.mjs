// DeviantArt upload flow を file inject まで進めて metadata form の selector を取る。
// /studio?new=1 → "Deviation" click → file input に test 画像注入 → 10s 待って metadata 形を snapshot
import puppeteer from 'puppeteer-core';
import { writeFileSync, appendFileSync, readFileSync } from 'fs';

const LOG = 'scripts/da-with-image-probe.log';
writeFileSync(LOG, `=== ${new Date().toISOString()} ===\n`);
const log = (...a) => {
  const line = a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x, null, 2))).join(' ');
  appendFileSync(LOG, line + '\n');
  process.stdout.write(line + '\n');
};
process.on('uncaughtException', (e) => { log('UNCAUGHT', e.message); process.exit(1); });

// 100x100 red PNG
const png = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x64, 0x00, 0x00, 0x00, 0x64, 0x08, 0x02, 0x00, 0x00, 0x00, 0xff, 0x80, 0x02,
  0x03, 0x00, 0x00, 0x00, 0x4f, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0xed, 0xc1, 0x01, 0x0d, 0x00,
  0x00, 0x00, 0xc2, 0xa0, 0xf7, 0x4f, 0x6d, 0x0e, 0x37, 0xa0, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0xbe, 0x0d, 0x21, 0x00, 0x00, 0x01, 0x9f, 0xab, 0xfd, 0x9c, 0x00, 0x00, 0x00, 0x00,
  0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
]);

const browser = await puppeteer.connect({ browserURL: 'http://localhost:9222', protocolTimeout: 240000 });
const page = await browser.newPage();
page.on('console', (m) => log('[page]', m.text().slice(0, 250)));

async function snapshot(label) {
  return await page.evaluate(() => {
    const fileInputs = Array.from(document.querySelectorAll('input[type="file"]')).map((f) => ({
      accept: f.accept,
      multiple: f.multiple,
      class: f.className?.toString?.().slice?.(0, 80),
      name: f.getAttribute('name'),
      // 親 chain (3 階層)
      parents: (() => {
        const a = []; let n = f.parentElement;
        while (n && a.length < 3) { a.push(`${n.tagName}.${(n.className?.toString?.()?.slice?.(0, 40)) ?? ''}`); n = n.parentElement; }
        return a;
      })(),
    }));
    const editors = Array.from(document.querySelectorAll('input[type="text"], textarea, [contenteditable="true"]'))
      .slice(0, 30)
      .map((el) => ({
        tag: el.tagName,
        type: el.getAttribute('type'),
        name: el.getAttribute('name'),
        ariaLabel: el.getAttribute('aria-label'),
        placeholder: el.getAttribute('placeholder'),
        contentEditable: el.getAttribute('contenteditable'),
        className: el.className?.toString?.().slice?.(0, 60),
        // 親 form / dialog 判定
        inDialog: !!el.closest('[role="dialog"]'),
      }));
    const buttons = Array.from(document.querySelectorAll('button, [role="button"]'))
      .filter((b) => /publish|submit|next|continue|post|送信|公開|投稿|次へ|publish now|share/i.test(
        ((b.getAttribute('aria-label') ?? '') + ' ' + (b.textContent ?? ''))
      ))
      .slice(0, 25)
      .map((b) => ({
        text: (b.textContent ?? '').trim().slice(0, 60),
        aria: b.getAttribute('aria-label'),
        disabled: b.disabled || b.getAttribute('aria-disabled') === 'true',
        class: b.className?.toString?.().slice?.(0, 80),
        testId: b.getAttribute('data-testid'),
      }));
    return {
      url: location.href,
      fileInputCount: fileInputs.length,
      fileInputs: fileInputs.slice(0, 8),
      editorCount: editors.length,
      editors: editors.slice(0, 12),
      relevantButtons: buttons,
    };
  });
}

log('navigating /studio?new=1');
await page.goto('https://www.deviantart.com/studio?new=1', { waitUntil: 'domcontentloaded', timeout: 30000 });
await new Promise((r) => setTimeout(r, 5000));

log('clicking Deviation');
const clicked = await page.evaluate(() => {
  const el = Array.from(document.querySelectorAll('button, [role="button"]')).find((b) =>
    /^Deviation$/i.test((b.textContent ?? '').trim().split('\n')[0])
  );
  if (el) { el.click(); return true; }
  return false;
});
log(`click result: ${clicked}`);
await new Promise((r) => setTimeout(r, 6000));

log('\n=== after Deviation click ===');
log(await snapshot('after click'));

// Find image-typed file input and inject the PNG
log('\ninjecting PNG into image file input');
const injectResult = await page.evaluate(async (bytes) => {
  const arr = new Uint8Array(bytes);
  const file = new File([arr], 'test.png', { type: 'image/png', lastModified: Date.now() });
  // Pick the first file input that accepts image (or the last one - DA mounts new ones progressively)
  const inputs = Array.from(document.querySelectorAll('input[type="file"]'));
  // image/jpg|jpeg|png のものを優先
  const imageInputs = inputs.filter((i) => /image\/(jpg|jpeg|png)/.test(i.accept));
  const target = imageInputs[imageInputs.length - 1] || inputs[inputs.length - 1];
  if (!target) return { ok: false, error: 'no file input' };
  const dt = new DataTransfer(); dt.items.add(file);
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'files').set;
  setter.call(target, dt.files);
  target.dispatchEvent(new Event('change', { bubbles: true }));
  target.dispatchEvent(new Event('input', { bubbles: true }));
  return { ok: true, accept: target.accept, idx: inputs.indexOf(target) };
}, Array.from(png));
log('inject result:', injectResult);

// Wait for upload + metadata form to render (DA can take 10-15s)
log('\nwaiting 12s for upload + metadata form...');
await new Promise((r) => setTimeout(r, 12000));

log('\n=== after upload + metadata wait ===');
log(await snapshot('after upload'));

await page.screenshot({ path: 'scripts/da-with-image-probe.png', fullPage: true });
log('screenshot: scripts/da-with-image-probe.png');
await browser.disconnect();
log('done');
