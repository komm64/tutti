/**
 * v0.5.6 Surface real multi-SNS post verify (CDP attach to Brave / Chromium)。
 *
 * 既存の Brave 起動セッションに CDP attach、 拡張の popup.html を新規 tab で
 * 開いて、 そこから chrome.runtime.sendMessage POST_REQUEST を送って bg の
 * handlePostRequest → recordHistoryEntry → addToPostHistory フロー全体を
 * 実投稿で発火させる。
 *
 * 注意:
 *   - Brave に v0.5.6 拡張が load 済 (extensions path に同期済) であること
 *   - extension service worker が CDP /json に出ないので、 popup page から
 *     bg にメッセージを投げる形を取る
 *   - POST_REQUEST は実 SNS に投稿が landing する。 test 垢 (.tutti-e2e-chrome
 *     の login 済みアカウント) を使う前提
 *
 * Usage: node scripts/e2e/verify-real-multipost.mjs [--platforms bluesky,mastodon,misskey]
 *   (default platforms: bluesky 単発。 mastodon/misskey は API creds 必須)
 */

import { chromium } from 'playwright';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..', '..');
const extensionDir = process.env.E2E_EXT_DIR ?? resolve(repoRoot, '.output', 'chrome-mv3');

const args = process.argv.slice(2);
const platformsIdx = args.indexOf('--platforms');
const platforms = platformsIdx >= 0 ? (args[platformsIdx + 1] ?? 'bluesky').split(',') : ['bluesky'];
const cdpEndpoint = process.env.E2E_CDP;
const userDataDir = process.env.E2E_USER_DATA_DIR;

console.log(`[verify] platforms=${platforms.join(',')}`);
console.log(`[verify] mode=${cdpEndpoint ? `CDP (${cdpEndpoint})` : `launch (${userDataDir ?? 'tmp'})`}`);

let browser;
let ctx;
if (cdpEndpoint) {
  browser = await chromium.connectOverCDP(cdpEndpoint, { timeout: 30000 });
  ctx = browser.contexts()[0];
  if (!ctx) {
    console.error('[verify] no context found');
    process.exit(3);
  }
} else {
  if (!existsSync(extensionDir)) {
    console.error(`[verify] extension not found: ${extensionDir}`);
    process.exit(2);
  }
  ctx = await chromium.launchPersistentContext(userDataDir ?? resolve(repoRoot, '.tmp', 'verify-profile'), {
    headless: false,
    args: [
      `--disable-extensions-except=${extensionDir}`,
      `--load-extension=${extensionDir}`,
      '--no-first-run',
      '--no-default-browser-check',
    ],
  });
}

// Extension id を取得 (優先順: env > service worker URL)
let extensionId = process.env.E2E_EXTENSION_ID ?? null;
if (!extensionId) {
  // launchPersistentContext モードでは service workers が見える
  for (let i = 0; i < 50; i += 1) {
    for (const s of ctx.serviceWorkers()) {
      const m = s.url().match(/^chrome-extension:\/\/([a-z]+)\//);
      if (m) { extensionId = m[1]; break; }
    }
    if (extensionId) break;
    await new Promise((r) => setTimeout(r, 200));
  }
}
if (!extensionId) {
  console.error('[verify] extension id not detected');
  process.exit(4);
}
console.log(`[verify] extension id=${extensionId}`);

// popup.html を新規 tab で開く。 popup page は extension context = chrome.* full access
const popup = await ctx.newPage();
await popup.goto(`chrome-extension://${extensionId}/popup.html`, {
  waitUntil: 'domcontentloaded',
  timeout: 15000,
});
await popup.waitForTimeout(1000);

const ver = await popup.evaluate(() => chrome.runtime.getManifest().version);
console.log(`[verify] extension version=${ver}`);

// 既存 history を clear して新規 entry を識別しやすくする
await popup.evaluate(async () => {
  await chrome.storage.local.set({ postHistory: [] });
  const s = (await chrome.storage.sync.get('settings'))['settings'] ?? {};
  await chrome.storage.sync.set({ settings: { ...s, autoPost: true } });
});
console.log('[verify] history cleared + autoPost=true');

// 1x1 PNG (transparent) を base64 で。 画像添付 path もテスト対象
const tinyPng = {
  name: `tutti-test-${Date.now()}.png`,
  type: 'image/png',
  data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  bytes: 70,
};
const text = `tutti v0.5.6 multi-post verify ${new Date().toISOString().slice(0, 19)}Z`;

console.log(`[verify] sending POST_REQUEST text="${text.slice(0, 30)}..." images=1`);
const t0 = Date.now();
const postResp = await popup.evaluate(async ({ text, platforms, image }) => {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      { type: 'POST_REQUEST', text, platforms, images: [image] },
      (resp) => resolve(resp ?? { ok: false, error: chrome.runtime.lastError?.message ?? 'no response' }),
    );
  });
}, { text, platforms, image: tinyPng });

console.log(`[verify] POST_REQUEST returned in ${Date.now() - t0}ms`);
console.log('[verify] response:', JSON.stringify(postResp).slice(0, 300));

// 投稿完了 + 履歴反映待ち。 multi-SNS は並列度 3 で 各 ~8-15s かかる
const maxWait = 60000;
const waitStart = Date.now();
let entry = null;
while (Date.now() - waitStart < maxWait) {
  const got = await popup.evaluate(async () => (await chrome.storage.local.get('postHistory'))['postHistory'] ?? []);
  if (got.length > 0) { entry = got[0]; break; }
  await new Promise((r) => setTimeout(r, 1000));
}
if (!entry) {
  console.error('[verify] history entry never appeared');
  if (cdpEndpoint && browser) await browser.close(); else await ctx.close();
  process.exit(5);
}

console.log('\n[verify] === History entry ===');
console.log(`  version: ${entry.version}`);
console.log(`  text (${entry.text?.length}): ${entry.text?.slice(0, 50)}...`);
console.log(`  bodyHash (${entry.bodyHash?.length}): ${entry.bodyHash?.slice(0, 16)}...`);
console.log(`  hasMedia: ${entry.hasMedia}`);
console.log(`  mediaRefs: ${JSON.stringify(entry.mediaRefs)}`);
console.log(`  platforms: ${entry.platforms?.join(',')}`);
for (const p of platforms) {
  const r = entry.results?.[p];
  console.log(`  ${p}: success=${r?.success} url=${r?.url ? r.url.slice(0, 60) + '...' : 'none'} postId=${r?.postId} error=${r?.error ?? 'none'}`);
}

const failures = [];
if (entry.version !== 1) failures.push(`schema version expected 1, got ${entry.version}`);
if (!entry.bodyHash || entry.bodyHash.length !== 64) failures.push(`bodyHash invalid (len=${entry.bodyHash?.length})`);
let successCount = 0;
let postIdCount = 0;
for (const p of platforms) {
  const r = entry.results?.[p];
  if (!r) {
    failures.push(`${p}: no result`);
    continue;
  }
  if (r.success) {
    successCount += 1;
    if (r.url && r.postId) postIdCount += 1;
    else if (r.url && !r.postId) failures.push(`${p}: url present but postId not extracted (url=${r.url})`);
  } else {
    failures.push(`${p}: failed (${r.error ?? 'no message'})`);
  }
}

if (cdpEndpoint && browser) await browser.close();
else await ctx.close();

console.log(`\n[verify] success rate: ${successCount}/${platforms.length}`);
console.log(`[verify] postId capture rate: ${postIdCount}/${successCount}`);

if (failures.length === 0 && successCount === platforms.length) {
  console.log('\n✓ PASS: all platforms succeeded with schema v1 + postId capture');
  process.exit(0);
}

console.error(`\n${successCount === platforms.length ? '⚠ PARTIAL' : '✗ FAIL'} (${failures.length} issues):`);
failures.forEach((f) => console.error(`  - ${f}`));
process.exit(failures.length > 0 ? 1 : 0);
