// Probe DeviantArt's upload flow.
// Pre-req: launch-test-brave.cmd で Brave 起動 + DeviantArt にログイン済み。
import puppeteer from 'puppeteer-core';
import { writeFileSync, appendFileSync } from 'fs';

const LOG = 'scripts/da-probe.log';
writeFileSync(LOG, `=== probe ${new Date().toISOString()} ===\n`);
const log = (...a) => {
  const line = a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x, null, 2))).join(' ');
  appendFileSync(LOG, line + '\n');
  process.stdout.write(line + '\n');
};

process.on('uncaughtException', (e) => { log('UNCAUGHT', e.message); process.exit(1); });
process.on('unhandledRejection', (e) => { log('UNHANDLED', String(e)); process.exit(1); });

log('connecting...');
const browser = await puppeteer.connect({ browserURL: 'http://localhost:9222', protocolTimeout: 180000 });
const page = await browser.newPage();
page.on('console', (m) => log('[page]', m.text().slice(0, 300)));

// DeviantArt の主要 upload エントリポイント候補
const CANDIDATES = [
  'https://www.deviantart.com/submit',
  'https://www.deviantart.com/submit/text',
  'https://www.deviantart.com/submit/photography',
  'https://www.deviantart.com/submit/journal',
];

async function snapshot(label) {
  return await page.evaluate(() => {
    const fileInputs = Array.from(document.querySelectorAll('input[type="file"]')).map((f) => ({
      accept: f.accept,
      multiple: f.multiple,
      hidden: f.hidden || getComputedStyle(f).display === 'none',
      name: f.getAttribute('name'),
      id: f.id,
      class: f.className?.toString?.().slice?.(0, 100),
    }));
    const editors = Array.from(document.querySelectorAll('input[type="text"], input:not([type]), textarea, [contenteditable="true"]'))
      .slice(0, 25)
      .map((el) => ({
        tag: el.tagName,
        type: el.getAttribute('type'),
        name: el.getAttribute('name'),
        id: el.id,
        placeholder: el.getAttribute('placeholder'),
        ariaLabel: el.getAttribute('aria-label'),
        maxlength: el.getAttribute('maxlength'),
        contentEditable: el.getAttribute('contenteditable'),
      }));
    const buttons = Array.from(document.querySelectorAll('button, [role="button"]'))
      .filter((b) => /next|next step|publish|submit|post|continue|送信|公開|投稿|次へ/i.test(
        (b.textContent ?? '') + ' ' + (b.getAttribute('aria-label') ?? '')
      ))
      .slice(0, 25)
      .map((b) => ({
        text: (b.textContent ?? '').trim().slice(0, 60),
        aria: b.getAttribute('aria-label'),
        type: b.getAttribute('type'),
        disabled: b.disabled || b.getAttribute('aria-disabled') === 'true',
        class: b.className?.toString?.().slice?.(0, 80),
        testId: b.getAttribute('data-testid'),
        hash: b.getAttribute('data-hook') ?? null,
      }));
    const dropzones = Array.from(document.querySelectorAll('[class*="drop" i], [class*="Drop" i]'))
      .slice(0, 8)
      .map((el) => ({ tag: el.tagName, class: el.className?.toString?.().slice?.(0, 100), text: (el.textContent ?? '').trim().slice(0, 50) }));
    return {
      url: location.href,
      title: document.title,
      fileInputs,
      editorCount: editors.length,
      editors,
      relevantButtons: buttons,
      nextLikeCount: buttons.filter((b) => /next|次/i.test(b.text + ' ' + (b.aria ?? ''))).length,
      dropzones,
      loggedInHint: !!document.querySelector('[data-username], [aria-label*="Username" i]'),
    };
  });
}

for (const url of CANDIDATES) {
  log(`\n[step] navigating: ${url}`);
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 });
  } catch (err) {
    log(`  goto failed: ${err.message?.slice(0, 200)}`);
    continue;
  }
  await new Promise((r) => setTimeout(r, 7000));
  let snap;
  try {
    snap = await snapshot(`after ${url}`);
  } catch (err) {
    log(`  snapshot failed: ${err.message?.slice(0, 200)}`);
    continue;
  }
  log(`\n=== ${url} ===`);
  log(snap);
  if (/login|signin/i.test(snap.url)) {
    log('  → login required');
    break;
  }
}

try {
  await page.screenshot({ path: 'scripts/da-upload-probe.png', fullPage: true });
  log('screenshot: scripts/da-upload-probe.png');
} catch (e) { log('screenshot failed', e.message); }

await browser.disconnect();
log('done');
