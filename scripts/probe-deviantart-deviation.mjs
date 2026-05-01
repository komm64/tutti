// DeviantArt の "Deviation" upload flow を深堀り probe する。
// /studio?new=1 → "Deviation" ボタンを click → modal/page の DOM を取る。
import puppeteer from 'puppeteer-core';
import { writeFileSync, appendFileSync } from 'fs';

const LOG = 'scripts/da-deviation-probe.log';
writeFileSync(LOG, `=== ${new Date().toISOString()} ===\n`);
const log = (...a) => {
  const line = a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x, null, 2))).join(' ');
  appendFileSync(LOG, line + '\n');
  process.stdout.write(line + '\n');
};
process.on('uncaughtException', (e) => { log('UNCAUGHT', e.message); process.exit(1); });
process.on('unhandledRejection', (e) => { log('UNHANDLED', String(e)); process.exit(1); });

const browser = await puppeteer.connect({ browserURL: 'http://localhost:9222', protocolTimeout: 180000 });
const page = await browser.newPage();
page.on('console', (m) => log('[page]', m.text().slice(0, 300)));

async function snapshot(label) {
  return await page.evaluate(() => {
    const fileInputs = Array.from(document.querySelectorAll('input[type="file"]')).map((f) => ({
      accept: f.accept,
      multiple: f.multiple,
      hidden: f.hidden || getComputedStyle(f).display === 'none',
      class: f.className?.toString?.().slice?.(0, 100),
    }));
    const editors = Array.from(document.querySelectorAll('input[type="text"], textarea, [contenteditable="true"]'))
      .slice(0, 25)
      .map((el) => ({
        tag: el.tagName,
        type: el.getAttribute('type'),
        name: el.getAttribute('name'),
        ariaLabel: el.getAttribute('aria-label'),
        placeholder: el.getAttribute('placeholder'),
        contentEditable: el.getAttribute('contenteditable'),
      }));
    const dropzones = Array.from(document.querySelectorAll('[class*="drop" i], [class*="Drop" i]'))
      .slice(0, 5)
      .map((el) => ({ tag: el.tagName, class: el.className?.toString?.().slice?.(0, 100) }));
    const buttons = Array.from(document.querySelectorAll('button, [role="button"]'))
      .filter((b) => /next|publish|submit|post|continue|next step|送信|公開|投稿|次へ/i.test(
        ((b.getAttribute('aria-label') ?? '') + ' ' + (b.textContent ?? ''))
      ))
      .slice(0, 20)
      .map((b) => ({
        text: (b.textContent ?? '').trim().slice(0, 50),
        aria: b.getAttribute('aria-label'),
        disabled: b.disabled || b.getAttribute('aria-disabled') === 'true',
        class: b.className?.toString?.().slice?.(0, 80),
      }));
    return {
      url: location.href,
      title: document.title,
      fileInputs,
      editors,
      dropzones,
      buttons,
      pageH1: Array.from(document.querySelectorAll('h1, h2, [role="heading"]'))
        .slice(0, 5)
        .map((h) => (h.textContent ?? '').trim().slice(0, 80)),
    };
  });
}

log('navigating to /studio?new=1');
await page.goto('https://www.deviantart.com/studio?new=1', { waitUntil: 'domcontentloaded', timeout: 25000 });
await new Promise((r) => setTimeout(r, 5000));

log('\n=== chooser page ===');
log(await snapshot('chooser'));

// "Deviation" 選択肢を click
log('\nclicking "Deviation" option');
const clicked = await page.evaluate(() => {
  const buttons = Array.from(document.querySelectorAll('button, a, [role="button"], [role="link"]'));
  const target = buttons.find((b) => /^Deviation$|Submit your art/i.test((b.textContent ?? '').trim().split('\n')[0]));
  if (target) {
    target.click();
    return { ok: true, text: (target.textContent ?? '').trim().slice(0, 80) };
  }
  return { ok: false, sample: buttons.slice(0, 5).map((b) => (b.textContent ?? '').trim().slice(0, 60)) };
});
log('click result:', clicked);

await new Promise((r) => setTimeout(r, 6000));
log('\n=== after Deviation click ===');
log(await snapshot('after click'));

await page.screenshot({ path: 'scripts/da-deviation-probe.png', fullPage: true });
await browser.disconnect();
log('done');
