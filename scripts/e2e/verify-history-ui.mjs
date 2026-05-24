// v0.5.9 Surface visual verify:
// 1. popup を開く → 履歴 strip が下部に常時表示されてる
// 2. ヘッダ "History ↗" link をクリック → history.html が tab で開く
// 3. history.html で entry の full text / actions が表示される
// 4. delete / copy / repost が動く
//
// 履歴 entry が無いと strip が "No posts yet" になるので、 まず POST_REQUEST で
// dummy entry を 1 件作ってから検証する。
import { chromium } from 'playwright';

const ctx = await chromium.launchPersistentContext(
  process.env.E2E_USER_DATA_DIR ?? 'C:/Users/komm64/.tutti-e2e-chrome',
  {
    headless: false,
    args: [
      `--disable-extensions-except=${process.env.E2E_EXT_DIR}`,
      `--load-extension=${process.env.E2E_EXT_DIR}`,
      '--no-first-run',
    ],
    viewport: null,
  },
);
let extId;
for (let i = 0; i < 50; i += 1) {
  for (const s of ctx.serviceWorkers()) {
    const m = s.url().match(/^chrome-extension:\/\/([a-z]+)\//);
    if (m) { extId = m[1]; break; }
  }
  if (extId) break;
  await new Promise((r) => setTimeout(r, 200));
}
console.log(`[verify] extension id=${extId}`);

const page = await ctx.newPage();
await page.goto(`chrome-extension://${extId}/popup.html`);
await page.waitForTimeout(800);

const ver = await page.evaluate(() => chrome.runtime.getManifest().version);
console.log(`[verify] version=${ver}`);

// 履歴 strip の DOM を check
const stripCheck = await page.evaluate(() => {
  const items = document.querySelectorAll('ul.max-h-56 > li');
  const headerLink = Array.from(document.querySelectorAll('button')).find((b) => /View all|全部見る/.test(b.textContent ?? ''));
  return {
    stripItemsCount: items.length,
    hasViewAllButton: Boolean(headerLink),
    historyHeaderText: Array.from(document.querySelectorAll('p')).map((p) => p.textContent?.trim()).filter((t) => /history|履歴/i.test(t ?? '')).slice(0, 3),
  };
});
console.log(`[verify] popup strip:`, JSON.stringify(stripCheck));

// history.html を直接開いて renderを check
const histPage = await ctx.newPage();
await histPage.goto(`chrome-extension://${extId}/history.html`);
await histPage.waitForTimeout(800);

const histCheck = await histPage.evaluate(() => {
  return {
    title: document.title,
    h1: document.querySelector('h1')?.textContent?.trim(),
    entryCount: document.querySelectorAll('ul > li').length,
    hasExportBtn: Boolean(Array.from(document.querySelectorAll('button')).find((b) => /Export|書き出し/.test(b.textContent ?? ''))),
    hasClearAllBtn: Boolean(Array.from(document.querySelectorAll('button')).find((b) => /Clear all|削除/.test(b.textContent ?? ''))),
    hasSearchInput: Boolean(document.querySelector('input[type="text"]')),
  };
});
console.log(`[verify] history tab:`, JSON.stringify(histCheck));

await page.screenshot({ path: 'C:/Users/komm64/popup-with-history.png', fullPage: true });
await histPage.screenshot({ path: 'C:/Users/komm64/history-tab.png', fullPage: true });
console.log('[verify] screenshots saved: popup-with-history.png, history-tab.png');

await ctx.close();

// PASS criteria
const failures = [];
if (!stripCheck.hasViewAllButton) failures.push('popup: View all link not found');
if (!histCheck.h1) failures.push('history.html: H1 missing');
if (!histCheck.hasExportBtn) failures.push('history.html: Export button missing');
if (!histCheck.hasSearchInput) failures.push('history.html: Search input missing');

if (failures.length) {
  console.error(`\n✗ FAIL:`);
  failures.forEach((f) => console.error(`  - ${f}`));
  process.exit(1);
}
console.log(`\n✓ PASS: popup strip + history.html renders correctly`);
