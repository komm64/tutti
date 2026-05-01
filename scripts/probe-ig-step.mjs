// Instagram の compose modal を段階的に probe する。
// 1 evaluate あたりのデータ量を絞って protocol timeout を回避。
import puppeteer from 'puppeteer-core';
import { writeFileSync, appendFileSync } from 'fs';

const LOG = 'scripts/ig-step-probe.log';
writeFileSync(LOG, `=== ${new Date().toISOString()} ===\n`);
const log = (...a) => {
  const line = a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x, null, 2))).join(' ');
  appendFileSync(LOG, line + '\n');
  process.stdout.write(line + '\n');
};
process.on('uncaughtException', (e) => { log('UNCAUGHT', e.message); process.exit(1); });

const browser = await puppeteer.connect({ browserURL: 'http://localhost:9222', protocolTimeout: 240000 });
const page = await browser.newPage();
page.on('console', (m) => log('[page]', m.text().slice(0, 200)));

log('navigating to /');
try {
  await page.goto('https://www.instagram.com/', { waitUntil: 'domcontentloaded', timeout: 30000 });
} catch (e) { log('goto failed', e.message); }
await new Promise((r) => setTimeout(r, 6000));

// 小さい evaluate に分ける
log('\n[1] document title + URL');
const meta = await page.evaluate(() => ({ url: location.href, title: document.title }));
log(meta);

log('\n[2] find Create button (text-based)');
const createBtn = await page.evaluate(() => {
  const all = Array.from(document.querySelectorAll('a, button, [role="link"], [role="button"]'));
  // text contain "Create" + tag
  const cands = all
    .map((b) => ({ tag: b.tagName, aria: b.getAttribute('aria-label') ?? '', text: (b.textContent ?? '').trim().slice(0, 30), href: b.getAttribute('href') }))
    .filter((c) => /create/i.test(c.aria + c.text))
    .slice(0, 5);
  return cands;
});
log('create candidates:', createBtn);

log('\n[3] click Create');
const clicked = await page.evaluate(() => {
  const all = Array.from(document.querySelectorAll('a, button, [role="link"], [role="button"]'));
  const target = all.find((b) => /create/i.test((b.getAttribute('aria-label') ?? '') + ' ' + ((b.textContent ?? '').trim())));
  if (!target) return { ok: false };
  target.click();
  return { ok: true };
});
log(clicked);
await new Promise((r) => setTimeout(r, 4000));

log('\n[4] post-click: dialog count + first dialog inner text snippet');
const afterClick = await page.evaluate(() => {
  const dlgs = document.querySelectorAll('[role="dialog"]');
  return {
    dialogCount: dlgs.length,
    firstDialogText: dlgs[0]?.textContent?.trim().slice(0, 200) ?? null,
    fileInputs: document.querySelectorAll('input[type="file"]').length,
  };
});
log(afterClick);

log('\n[5] menuitem options after Create click (sub-menu)');
const subMenuOpts = await page.evaluate(() => {
  return Array.from(document.querySelectorAll('a, button, [role="menuitem"], [role="link"], [role="button"]'))
    .map((b) => ({ tag: b.tagName, role: b.getAttribute('role'), text: (b.textContent ?? '').trim().slice(0, 40) }))
    .filter((c) => /^post$|^reel$|^story$|投稿|reels?/i.test(c.text))
    .slice(0, 10);
});
log('sub-menu opts:', subMenuOpts);

// "Post" sub-option click
log('\n[6] click Post sub-option');
const subClick = await page.evaluate(() => {
  const items = Array.from(document.querySelectorAll('a, button, [role="menuitem"], [role="link"], [role="button"]'))
    .filter((b) => /^Post$|^投稿$/i.test((b.textContent ?? '').trim()));
  if (items.length === 0) return { ok: false };
  items[0].click();
  return { ok: true, count: items.length };
});
log(subClick);
await new Promise((r) => setTimeout(r, 4500));

log('\n[7] file input + dialog text after Post click');
const final = await page.evaluate(() => {
  const fis = Array.from(document.querySelectorAll('input[type="file"]')).map((f) => ({
    accept: f.accept,
    multiple: f.multiple,
    inDialog: !!f.closest('[role="dialog"]'),
  }));
  const dlg = document.querySelector('[role="dialog"]');
  return {
    fileInputs: fis,
    dialogTextSnippet: dlg?.textContent?.trim().slice(0, 200) ?? null,
    dialogButtons: dlg ? Array.from(dlg.querySelectorAll('button')).map((b) => ({ text: (b.textContent ?? '').trim().slice(0, 30), aria: b.getAttribute('aria-label') })).slice(0, 8) : [],
  };
});
log(final);

await page.screenshot({ path: 'scripts/ig-step-probe.png', fullPage: false });
await browser.disconnect();
log('done');
