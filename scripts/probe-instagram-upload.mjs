// Probe Instagram's web compose flow.
// Pre-req: launch-test-brave.cmd で Brave 起動 + Instagram にログイン済み。
//
// Instagram Web は home の "+" Create アイコン → 多段モーダル (file → crop → filter → caption → share)。
// このプローブでは home に行って Create モーダルを開いた後の DOM を snapshot する。
import puppeteer from 'puppeteer-core';
import { writeFileSync, appendFileSync } from 'fs';

const LOG = 'scripts/ig-probe.log';
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

async function snapshot(label) {
  return await page.evaluate(() => {
    const fileInputs = Array.from(document.querySelectorAll('input[type="file"]')).map((f) => ({
      accept: f.accept,
      multiple: f.multiple,
      hidden: f.hidden || getComputedStyle(f).display === 'none',
      name: f.getAttribute('name'),
      class: f.className?.toString?.().slice?.(0, 100),
      // 親 dialog があるか?
      inDialog: !!f.closest('[role="dialog"]'),
    }));
    const editors = Array.from(document.querySelectorAll('input[type="text"], textarea, [contenteditable="true"]'))
      .slice(0, 20)
      .map((el) => ({
        tag: el.tagName,
        type: el.getAttribute('type'),
        name: el.getAttribute('name'),
        ariaLabel: el.getAttribute('aria-label'),
        placeholder: el.getAttribute('placeholder'),
        contentEditable: el.getAttribute('contenteditable'),
        inDialog: !!el.closest('[role="dialog"]'),
      }));
    const dialogButtons = Array.from(document.querySelectorAll('[role="dialog"] button, [role="dialog"] [role="button"]'))
      .slice(0, 25)
      .map((b) => ({
        text: (b.textContent ?? '').trim().slice(0, 60),
        aria: b.getAttribute('aria-label'),
        disabled: b.disabled || b.getAttribute('aria-disabled') === 'true',
      }));
    return {
      url: location.href,
      title: document.title,
      hasDialog: !!document.querySelector('[role="dialog"]'),
      dialogCount: document.querySelectorAll('[role="dialog"]').length,
      fileInputs,
      editorCount: editors.length,
      editors,
      dialogButtonCount: dialogButtons.length,
      dialogButtons,
      // Create / 投稿 / + ボタン候補
      createCandidates: Array.from(document.querySelectorAll('a, button, [role="link"], [role="button"]'))
        .filter((b) => /create|create new|新規投稿|新しい投稿|new post|投稿|^\s*\+\s*$/i.test((b.getAttribute('aria-label') ?? '') + ' ' + ((b.textContent ?? '').trim())))
        .slice(0, 8)
        .map((b) => ({ aria: b.getAttribute('aria-label'), text: (b.textContent ?? '').trim().slice(0, 30), tag: b.tagName })),
    };
  });
}

log('\n[step] navigate to Instagram home');
try {
  await page.goto('https://www.instagram.com/', { waitUntil: 'domcontentloaded', timeout: 30000 });
} catch (err) {
  log(`goto failed: ${err.message?.slice(0, 200)}`);
}
await new Promise((r) => setTimeout(r, 7000));

const initial = await snapshot('home');
log('=== home initial ===', initial);

if (/accounts\/login/i.test(initial.url)) {
  log('  → not logged in. Instagram にログインしてから再実行。');
} else {
  // Try to click Create button to open modal
  log('\n[step] looking for Create button + click');
  const clicked = await page.evaluate(() => {
    const candidates = Array.from(document.querySelectorAll('a, button, [role="link"], [role="button"]'));
    // text 内容で判定 (aria-label が空のことが多い)
    const target = candidates.find((b) => {
      const haystack = (b.getAttribute('aria-label') ?? '') + ' ' + ((b.textContent ?? '').trim());
      return /new post|create|新規投稿|新しい投稿/i.test(haystack);
    });
    if (target) {
      target.click();
      return { ok: true, found: (target.getAttribute('aria-label') ?? '') + ' / ' + (target.textContent?.trim().slice(0, 40) ?? '') };
    }
    return { ok: false, candidates: candidates.slice(0, 8).map((b) => ({ aria: b.getAttribute('aria-label'), text: (b.textContent ?? '').trim().slice(0, 30) })) };
  });
  log('Create click:', clicked);

  await new Promise((r) => setTimeout(r, 4000));
  const afterCreate = await snapshot('after create click');
  log('=== after Create click ===', afterCreate);

  // If a Post / Reel / Story sub-menu appeared, try clicking "Post"
  if (afterCreate.hasDialog || afterCreate.createCandidates.length > 0) {
    log('\n[step] looking for Post sub-option');
    const sub = await page.evaluate(() => {
      const items = Array.from(document.querySelectorAll('a, button, [role="link"], [role="menuitem"]'))
        .filter((b) => /^post$|^投稿$|フィード/i.test((b.textContent ?? '').trim()));
      if (items.length > 0) {
        items[0].click();
        return { ok: true, count: items.length };
      }
      return { ok: false };
    });
    log('Post sub click:', sub);
    await new Promise((r) => setTimeout(r, 4000));
    const afterPost = await snapshot('after Post sub');
    log('=== after Post sub click ===', afterPost);
  }
}

try {
  await page.screenshot({ path: 'scripts/ig-upload-probe.png', fullPage: true });
  log('screenshot: scripts/ig-upload-probe.png');
} catch (e) { log('screenshot failed', e.message); }

await browser.disconnect();
log('done');
