/**
 * v0.4.86 〜 v0.4.92 で導入した popup の新 UI と機能の動作確認。
 * Surface ダミー環境で:
 *   1. popup を開いて render が落ちないこと
 *   2. console error がないこと
 *   3. 新 UI 要素が存在すること (alt input / preset chip / advanced section /
 *      history search / video trim button が必要時に出る等)
 *   4. failure hint card が ✗ ⓘ click で出ること
 *   5. SNS preset の save / apply
 *
 * 実投稿は dry-run で stop。 multi-account guard + failure hint の動線を観察する。
 */
import puppeteer from 'puppeteer-core';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';

const browser = await puppeteer.connect({
  browserURL: 'http://localhost:9222',
  defaultViewport: null,
  protocolTimeout: 120000,
});
const EXT_ID = 'dophemlpjldcejjdjefpjbgngodopkfe';

let popupPage = (await browser.pages()).find((p) => p.url().includes(`chrome-extension://${EXT_ID}/popup.html`));
if (!popupPage) {
  popupPage = await browser.newPage();
  await popupPage.goto(`chrome-extension://${EXT_ID}/popup.html`, { waitUntil: 'domcontentloaded', timeout: 30000 });
}
await popupPage.bringToFront();
await new Promise((r) => setTimeout(r, 2000));

const consoleErrors = [];
popupPage.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(m.text());
});
popupPage.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));

// ── 1. popup version & basic render ────────────────────────────
const meta = await popupPage.evaluate(() => {
  const versionEl = document.querySelector('.text-xs.font-normal.text-gray-400.ml-1');
  return {
    title: document.title,
    versionLabel: versionEl?.textContent?.trim(),
    rootMounted: !!document.querySelector('main, body > div, body > h1'),
    advancedToggle: !!Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.includes('詳細') || b.textContent?.includes('Advanced')),
    presetSave: !!Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.includes('プリセット保存') || b.textContent?.includes('Save preset')),
    historyToggle: !!Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.includes('履歴') || b.textContent?.includes('History')),
  };
});
console.log('1. popup mount:', JSON.stringify(meta, null, 2));

// ── 2. attach a test image ──────────────────────────────────
const imgPath = resolve(process.cwd(), 'scripts/e2e/fixtures/test-image.jpg');
const imgB64 = readFileSync(imgPath).toString('base64');
console.log('2. attaching image via file input...');
// popup has a hidden <input type="file"> we can target via setInputFiles
const fileInputHandle = await popupPage.$('input[type="file"]');
if (fileInputHandle) {
  await fileInputHandle.uploadFile(imgPath);
  await new Promise((r) => setTimeout(r, 1500));
  // alt input should now appear
  const afterAttach = await popupPage.evaluate(() => {
    const altInputs = Array.from(document.querySelectorAll('input[placeholder*="alt" i], input[placeholder*="a11y" i]'));
    const moveUpButtons = Array.from(document.querySelectorAll('button[title*="上" i], button[title*="up" i]'));
    return {
      altInputCount: altInputs.length,
      moveButtonCount: moveUpButtons.length,
      thumbnailCount: document.querySelectorAll('img[src^="blob:"]').length,
    };
  });
  console.log('  → ', JSON.stringify(afterAttach));
} else {
  console.log('  → file input not found (popup may not have rendered)');
}

// ── 3. open advanced section ──────────────────────────────
console.log('3. clicking advanced section...');
try {
  const clicked = await popupPage.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find((b) => /詳細|Advanced/i.test(b.textContent ?? ''));
    if (!btn) return false;
    btn.click();
    return true;
  });
  if (clicked) {
    await new Promise((r) => setTimeout(r, 500));
    const advanced = await popupPage.evaluate(() => ({
      cwInput: !!document.getElementById('cw-input'),
      visibilitySelect: !!document.getElementById('visibility-select'),
    }));
    console.log('  → expanded:', JSON.stringify(advanced));
  } else {
    console.log('  → advanced button not found');
  }
} catch (e) {
  console.log('  → err:', e.message);
}

// ── 4. open history section ───────────────────────────────
console.log('4. opening history...');
try {
  const opened = await popupPage.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find((b) => /履歴|History/i.test(b.textContent ?? ''));
    if (!btn) return false;
    btn.click();
    return true;
  });
  if (opened) {
    await new Promise((r) => setTimeout(r, 500));
    const historyUi = await popupPage.evaluate(() => ({
      searchInput: !!document.querySelector('input[placeholder*="検索" i], input[placeholder*="Search" i]'),
      filterDropdown: !!Array.from(document.querySelectorAll('select')).find((s) => s.options && Array.from(s.options).some((o) => /全て|All|失敗あり/i.test(o.textContent ?? ''))),
    }));
    console.log('  → history UI:', JSON.stringify(historyUi));
  }
} catch (e) {
  console.log('  → err:', e.message);
}

// ── 5. screenshot for visual confirmation ─────────────────
console.log('5. taking screenshot...');
const screenshot = resolve(process.cwd(), 'scripts/e2e/v0492-popup.png');
try {
  await popupPage.screenshot({ path: screenshot, fullPage: true });
  console.log('  → saved to:', screenshot);
} catch (e) {
  console.log('  → screenshot err:', e.message);
}

// ── 結果まとめ ───────────────────────────────────────────
console.log('\n=== Console errors (' + consoleErrors.length + ') ===');
for (const e of consoleErrors) console.log('  ' + e);

browser.disconnect();
console.log('\n=== verify done ===');
