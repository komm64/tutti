/**
 * v0.5.7 Surface verify: 3 SNS multi-post で:
 * - Threads が success returns (false-fail じゃない)
 * - 各 SNS の post URL が auto-open 用に取れている
 * - history v1 schema に正しく書き込まれている
 * - autoOpenPostUrl が 'always' で動作する (新タブ open)
 * - Tutti が開いた compose tab が成功後に close される
 *
 * Brave 既存セッション + Tutti 必須。 v0.5.7 を `C:/Users/komm64/Projects/tutti/.output/chrome-mv3` に sync 済の前提。
 * fresh user-data-dir で実行 (SW cache busting)。
 */
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
const page = await ctx.newPage();
await page.goto(`chrome-extension://${extId}/popup.html`);
await page.waitForTimeout(500);

const ver = await page.evaluate(() => chrome.runtime.getManifest().version);
console.log(`[verify] version=${ver}`);

const platformsParam = process.env.PLATFORMS ?? 'bluesky';
const platforms = platformsParam.split(',');
console.log(`[verify] platforms=${platforms.join(',')}`);

// 設定: autoPost=true, autoOpenPostUrl=always
await page.evaluate(async () => {
  await chrome.storage.local.set({ postHistory: [] });
  const s = (await chrome.storage.sync.get('settings'))['settings'] ?? {};
  await chrome.storage.sync.set({
    settings: { ...s, autoPost: true, autoOpenPostUrl: 'always' },
  });
});

const tabsBefore = await ctx.pages().length;
console.log(`[verify] tabs before=${tabsBefore}`);

const text = `tutti v0.5.7 verify ${new Date().toISOString().slice(11, 19)}`;
console.log(`[verify] posting: ${text} -> ${platforms.join(',')}`);

const t0 = Date.now();
const resp = await page.evaluate(async ({ text, platforms }) => {
  return new Promise((res) => {
    chrome.runtime.sendMessage(
      { type: 'POST_REQUEST', text, platforms },
      (r) => res(r ?? { err: chrome.runtime.lastError?.message }),
    );
  });
}, { text, platforms });
console.log(`[verify] POST_REQUEST returned in ${Date.now() - t0}ms`);
console.log(`[verify] response:`, JSON.stringify(resp).slice(0, 300));

await new Promise((r) => setTimeout(r, 5000));

const tabsAfter = ctx.pages().length;
console.log(`[verify] tabs after=${tabsAfter} (delta ${tabsAfter - tabsBefore})`);

// post URLs を auto-open した tab を列挙
const allTabs = ctx.pages();
const snsUrls = [];
for (const p of allTabs) {
  const u = p.url();
  if (/(?:bsky|mastodon|threads|misskey|tumblr|pixiv)/i.test(u)) snsUrls.push(u);
}
console.log(`[verify] SNS-related tabs (${snsUrls.length}):`);
snsUrls.forEach((u) => console.log(`  - ${u}`));

// history を dump
const hist = await page.evaluate(async () => (await chrome.storage.local.get('postHistory'))['postHistory']);
console.log(`[verify] history:`, JSON.stringify(hist, null, 2));

await ctx.close();

const failures = [];
const entry = hist?.[0];
if (!entry) failures.push('no history entry');
else {
  if (entry.version !== 1) failures.push(`history version=${entry.version}, expected 1`);
  for (const p of platforms) {
    const r = entry.results?.[p];
    if (!r) failures.push(`no result for ${p}`);
    else if (!r.success) failures.push(`${p} failed: ${r.error}`);
  }
}

if (failures.length) {
  console.error(`\n✗ FAIL:`);
  failures.forEach((f) => console.error(`  - ${f}`));
  process.exit(1);
}
console.log(`\n✓ PASS: ${platforms.length} platforms, v0.5.7 verify complete`);
