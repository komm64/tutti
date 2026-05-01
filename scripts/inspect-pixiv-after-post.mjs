// 失敗した Pixiv post 後の state を inspect。
// どの Post button が submit か、エラーが出てるか、form validity 等。
import puppeteer from 'puppeteer-core';
import { writeFileSync, appendFileSync } from 'fs';

const LOG = 'scripts/pixiv-inspect.log';
writeFileSync(LOG, `=== ${new Date().toISOString()} ===\n`);
const log = (...a) => {
  const line = a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x, null, 2))).join(' ');
  appendFileSync(LOG, line + '\n');
  process.stdout.write(line + '\n');
};
process.on('uncaughtException', (e) => { log('UNCAUGHT', e.message); process.exit(1); });

const browser = await puppeteer.connect({ browserURL: 'http://localhost:9222', protocolTimeout: 180000 });
const pages = await browser.pages();
const page = pages.find((p) => /pixiv\.net\/illustration\/create/.test(p.url()));
if (!page) {
  log('no pixiv create page open. Run real-post test first.');
  process.exit(0);
}
log(`inspecting ${page.url()}`);

const state = await page.evaluate(() => {
  const fileInputs = Array.from(document.querySelectorAll('input[type="file"]')).length;
  const titleEl = document.querySelector('input[name="title"]');
  const captionEl = document.querySelector('textarea[name="comment"]');

  // 全 Post / submit ボタン
  const posts = Array.from(document.querySelectorAll('button')).filter((b) => /^Post$|^投稿$/i.test((b.textContent ?? '').trim()));
  const postInfo = posts.map((b) => ({
    text: (b.textContent ?? '').trim(),
    disabled: b.disabled,
    ariaDisabled: b.getAttribute('aria-disabled'),
    type: b.getAttribute('type'),
    class: b.className?.toString?.().slice?.(0, 100),
    rect: b.getBoundingClientRect ? (() => { const r = b.getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), inViewport: r.top >= 0 && r.bottom <= innerHeight }; })() : null,
  }));

  // エラー / validation 表示
  const errors = Array.from(document.querySelectorAll('[class*="error" i], [role="alert"], [class*="invalid" i]'))
    .filter((el) => (el.textContent ?? '').trim().length > 0)
    .map((el) => ({
      tag: el.tagName,
      class: el.className?.toString?.().slice?.(0, 60),
      text: (el.textContent ?? '').trim().slice(0, 100),
    }))
    .slice(0, 10);

  // form の "required" field の埋まり具合
  const requiredFields = Array.from(document.querySelectorAll('input[required], textarea[required]'))
    .map((el) => ({
      name: el.getAttribute('name'),
      placeholder: el.getAttribute('placeholder'),
      hasValue: ('value' in el && el.value !== '') || (el.textContent ?? '').trim().length > 0,
    }));

  // image preview (アップロード済みかどうか)
  const previews = document.querySelectorAll('img[src^="blob:"], canvas');
  const dropzoneVisible = !!document.querySelector('[class*="drop" i], [class*="Drop" i]');

  return {
    url: location.href,
    titleValue: titleEl?.value ?? null,
    captionValue: (captionEl?.value ?? '').slice(0, 80),
    fileInputCount: fileInputs,
    previewCount: previews.length,
    postButtonCount: posts.length,
    postButtons: postInfo,
    errors,
    requiredFields,
    dropzoneVisible,
  };
});

log(JSON.stringify(state, null, 2));

// disabled じゃない Post button (submit-likely) を見つけて click してみる
const submitClick = await page.evaluate(() => {
  const posts = Array.from(document.querySelectorAll('button')).filter((b) =>
    /^Post$|^投稿$/i.test((b.textContent ?? '').trim()) && !b.disabled && b.getAttribute('aria-disabled') !== 'true'
  );
  // 既存の Tutti runPost が既にクリックした header Post は skip → 別の enabled な Post を探す
  // 上から順に試す: 最後の enabled なやつ (= bottom submit が enabled になってれば) を click
  if (posts.length === 0) return { ok: false, reason: 'no enabled Post button' };
  // 既に出てる disabled な数も記録
  const total = Array.from(document.querySelectorAll('button')).filter((b) => /^Post$|^投稿$/i.test((b.textContent ?? '').trim())).length;
  return {
    enabledCount: posts.length,
    totalCount: total,
    classOfFirst: posts[0].className?.toString?.().slice?.(0, 80),
  };
});
log('post button summary:', submitClick);

await page.screenshot({ path: 'scripts/pixiv-after-failed-post.png', fullPage: false });
await browser.disconnect();
log('done');
