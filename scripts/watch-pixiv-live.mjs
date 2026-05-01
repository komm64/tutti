// Pixiv compose タブの live state を 2 秒おきに snapshot して出力する。
// newPage() は使わない (puppeteer が詰まる原因)。既存タブを取るだけ。
// 投稿テスト中に並走させて、Tutti のどのステップが効いてどこで詰まるか見る。
import puppeteer from 'puppeteer-core';
import { writeFileSync, appendFileSync } from 'fs';

const LOG = 'scripts/pixiv-live.log';
writeFileSync(LOG, `=== ${new Date().toISOString()} ===\n`);
const log = (...a) => {
  const line = a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' ');
  appendFileSync(LOG, line + '\n');
  process.stdout.write(line + '\n');
};
process.on('uncaughtException', (e) => { log('UNCAUGHT', e.message); process.exit(1); });

log('connecting...');
const browser = await puppeteer.connect({ browserURL: 'http://localhost:9222', protocolTimeout: 240000 });
const pages = await browser.pages();
const page = pages.find((p) => /pixiv\.net\/illustration\/create/.test(p.url()));
if (!page) {
  log('no pixiv create page');
  process.exit(0);
}
log(`watching ${page.url()}`);

// Console messages を全部キャプチャ
page.on('console', (m) => log(`[page ${m.type()}]`, m.text().slice(0, 250)));
page.on('pageerror', (e) => log('[page-err]', e.message?.slice(0, 200)));

const start = Date.now();
const MAX_DURATION_MS = 90000; // 90s で切る

while (Date.now() - start < MAX_DURATION_MS) {
  let snap;
  try {
    snap = await page.evaluate(() => ({
      url: location.href,
      title: document.querySelector('input[name="title"]')?.value ?? null,
      captionLen: (document.querySelector('textarea[name="comment"]')?.value ?? '').length,
      tagInputVal: document.querySelector('input[placeholder="Tags"]')?.value ?? null,
      tagChips: document.querySelectorAll('[role="listitem"], li[class*="tag" i]').length,
      previewCount: document.querySelectorAll('img[src^="blob:"], canvas').length,
      visibilityChecked: !!document.querySelector('input[type="radio"][name="x_restrict"]:checked')?.value,
      aiTypeChecked: !!document.querySelector('input[type="radio"][name="ai_type"]:checked')?.value,
      visibilityVal: document.querySelector('input[type="radio"][name="x_restrict"]:checked')?.value ?? null,
      aiTypeVal: document.querySelector('input[type="radio"][name="ai_type"]:checked')?.value ?? null,
      requiredLabels: [...document.querySelectorAll('*')]
        .filter((e) => !e.children.length && /Required|必須/i.test((e.textContent ?? '').trim()))
        .slice(0, 5)
        .map((e) => e.parentElement?.querySelector('span[width]')?.textContent?.trim().slice(0, 30) ?? '?'),
    }));
  } catch (e) {
    log(`eval failed: ${e.message?.slice(0, 100)}`);
    await new Promise((r) => setTimeout(r, 2000));
    continue;
  }
  log(`t+${Math.round((Date.now() - start) / 1000)}s`, snap);
  // 完了判定: URL が /artworks/ に行ったら break
  if (/\/artworks\//.test(snap.url)) {
    log('🎉 POST SUCCESS — redirected to /artworks/');
    break;
  }
  await new Promise((r) => setTimeout(r, 2000));
}

await browser.disconnect();
log('done');
