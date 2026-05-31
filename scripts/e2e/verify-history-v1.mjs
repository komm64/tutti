/**
 * v0.5.5 History schema v1 を実投稿で verify する Surface 専用 script。
 *
 * 流れ:
 *   1. Persistent profile (E2E_USER_DATA_DIR) + 拡張 .output/chrome-mv3 で Chromium launch
 *   2. Bluesky DOM 投稿 (test 垢でログイン済の前提) を POST_REQUEST 経路で打つ
 *      = popup 経由と同じ orchestration を bg 内で走らせるため、 recordHistoryEntry が叩かれる
 *   3. chrome.storage.local.postHistory[0] を読んで v1 schema を assert
 *   4. historyKeepMedia OFF → mediaRefs undefined を確認
 *   5. (option) historyKeepMedia ON + 画像投稿 → IndexedDB に media が入ることを確認
 *
 * Usage: node scripts/e2e/verify-history-v1.mjs [--keep-media]
 */

import { chromium } from 'playwright';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..', '..');
const extensionDir = resolve(repoRoot, '.output', 'chrome-mv3');
const userDataDir = process.env.E2E_USER_DATA_DIR
  ?? resolve(process.env.USERPROFILE ?? process.env.HOME ?? '/tmp', '.tutti-e2e-chrome');

const keepMedia = process.argv.includes('--keep-media');
const cdpEndpoint = process.env.E2E_CDP;

if (!cdpEndpoint && !existsSync(extensionDir)) {
  console.error(`[verify] extension not built: ${extensionDir}`);
  process.exit(2);
}

console.log(`[verify] mode=${cdpEndpoint ? `CDP attach (${cdpEndpoint})` : 'launch persistent'}`);
console.log(`[verify] extension=${cdpEndpoint ? '(loaded by external launcher)' : extensionDir}`);
console.log(`[verify] profile=${cdpEndpoint ? '(external)' : userDataDir}`);
console.log(`[verify] keepMedia=${keepMedia}`);

let ctx;
let browser;
if (cdpEndpoint) {
  // 既に Brave / Chromium が起動済 (--remote-debugging-port=9222) で
  // 拡張が load 済の前提。 ctx を 1 つ取って sw を見つける
  browser = await chromium.connectOverCDP(cdpEndpoint, { timeout: 30000 });
  const ctxs = browser.contexts();
  ctx = ctxs[0];
  if (!ctx) {
    console.error('[verify] no context found on CDP endpoint');
    process.exit(3);
  }
} else {
  ctx = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    channel: 'chromium',
    args: [
      `--disable-extensions-except=${extensionDir}`,
      `--load-extension=${extensionDir}`,
      '--no-first-run',
    ],
  });
}

/**
 * Extension service worker 取得。 Playwright の ctx.serviceWorkers() は
 * CDP attach 時に extension SW が live でも含めないことがある (= filter から漏れる)。
 * 既存の content script が居る web page で chrome.runtime.id を読んで extension id を
 * 取り、 chrome-extension://<id>/options.html を新規 tab で開いて、 そこから
 * chrome.* API を叩く方が確実。
 */
async function openExtensionContext() {
  // 1. 既存の web page から extension id を取る (content script があれば chrome.runtime.id 取得可)
  let extensionId = null;
  for (const p of ctx.pages()) {
    if (!/^https?:/.test(p.url())) continue;
    try {
      extensionId = await p.evaluate(() => {
        // eslint-disable-next-line no-undef
        return typeof chrome !== 'undefined' && chrome.runtime?.id ? chrome.runtime.id : null;
      });
      if (extensionId) break;
    } catch { /* ignore */ }
  }
  // 2. ctx.serviceWorkers() からも試す
  if (!extensionId) {
    for (const s of ctx.serviceWorkers()) {
      const m = s.url().match(/^chrome-extension:\/\/([a-z]+)\//);
      if (m) { extensionId = m[1]; break; }
    }
  }
  // 3. 最終手段: bsky.app を新規 tab で開いて content script を発火させる
  if (!extensionId) {
    console.log('[verify] opening bsky.app to trigger content script injection...');
    const bootPage = await ctx.newPage();
    await bootPage.goto('https://bsky.app/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await bootPage.waitForTimeout(2000);
    try {
      extensionId = await bootPage.evaluate(() => {
        // eslint-disable-next-line no-undef
        return typeof chrome !== 'undefined' && chrome.runtime?.id ? chrome.runtime.id : null;
      });
    } catch { /* ignore */ }
  }
  if (!extensionId) throw new Error('extension id not detected (no content-script tab found)');
  console.log(`[verify] extension id=${extensionId}`);

  // 3. extension の options.html を新規 tab で開いて、 そこから evaluate する。
  //    options.html は extension page context なので chrome.* full access。
  const extPage = await ctx.newPage();
  await extPage.goto(`chrome-extension://${extensionId}/options.html`, {
    waitUntil: 'domcontentloaded',
    timeout: 15000,
  });
  await extPage.waitForTimeout(500);
  return { extensionId, extPage };
}

let extensionId;
let extPage;
({ extensionId, extPage } = await openExtensionContext());

// CDP attach 時、 拡張ファイル更新後に runtime に反映するため reload。
// reload は extPage を破壊するので、 再 open する。
if (cdpEndpoint) {
  console.log('[verify] reloading extension to pick up fresh build...');
  try {
    await extPage.evaluate(() => chrome.runtime.reload());
  } catch { /* sw 落ちる side-effect */ }
  await new Promise((r) => setTimeout(r, 4000));
  try { await extPage.close(); } catch {}
  // 新規 options.html を取り直す
  for (let i = 0; i < 20; i += 1) {
    try {
      extPage = await ctx.newPage();
      await extPage.goto(`chrome-extension://${extensionId}/options.html`, {
        waitUntil: 'domcontentloaded',
        timeout: 5000,
      });
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  await extPage.waitForTimeout(1000);
  // version 確認
  const ver = await extPage.evaluate(() => chrome.runtime.getManifest().version);
  console.log(`[verify] extension version after reload: ${ver}`);
}

// historyKeepMedia toggle + 履歴クリア + autoPost ON
await extPage.evaluate(async (keep) => {
  await chrome.storage.local.set({ postHistory: [] });
  const s = (await chrome.storage.sync.get('settings'))['settings'] ?? {};
  await chrome.storage.sync.set({
    settings: { ...s, historyKeepMedia: keep, autoPost: true },
  });
  return true;
}, keepMedia);

// Bluesky の compose に navigate (login session 確認)
const page = await ctx.newPage();
const text = `tutti v0.5.5 history-v1 verify ${new Date().toISOString()}`;
const composeUrl = `https://bsky.app/intent/compose?text=${encodeURIComponent(text)}`;
await page.goto(composeUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForTimeout(2000);
const loggedIn = await page.locator('.tiptap.ProseMirror[contenteditable="true"], [contenteditable="true"][role="textbox"]').first().isVisible().catch(() => false);
if (!loggedIn) {
  console.error('[verify] not logged in to Bluesky test account in this profile');
  await ctx.close();
  process.exit(4);
}
console.log('[verify] bluesky logged-in, proceeding to POST_REQUEST');

// 画像 attachment (--keep-media 時のみ)。 最小 PNG 1x1 transparent。
const tinyPng = keepMedia
  ? {
      name: 'tiny.png',
      type: 'image/png',
      data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
      bytes: 70,
    }
  : null;

// POST_REQUEST を bg に送信 → handlePostRequest → recordHistoryEntry が走る
const postResult = await extPage.evaluate(async ({ text, image }) => {
  return await chrome.runtime.sendMessage({
    type: 'POST_REQUEST',
    text,
    platforms: ['bluesky'],
    images: image ? [image] : undefined,
  });
}, { text, image: tinyPng });

console.log('[verify] POST_REQUEST returned:', JSON.stringify(postResult).slice(0, 200));

// 投稿完了 + 履歴反映待ち
await page.waitForTimeout(8000);

// History を読んで schema v1 を assert
const audit = await extPage.evaluate(async () => {
  const got = await chrome.storage.local.get('postHistory');
  const history = got['postHistory'] ?? [];
  const entry = history[0];
  if (!entry) return { ok: false, reason: 'no history entry' };

  // IndexedDB media check
  let mediaCount = 0;
  try {
    const db = await new Promise((res, rej) => {
      const req = indexedDB.open('tutti-history-media', 1);
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    });
    const tx = db.transaction('media', 'readonly');
    mediaCount = await new Promise((res) => {
      const c = tx.objectStore('media').count();
      c.onsuccess = () => res(c.result);
      c.onerror = () => res(-1);
    });
    db.close();
  } catch (e) {
    mediaCount = -2;
  }

  return {
    ok: true,
    entry: {
      version: entry.version,
      id: entry.id,
      textPreviewLen: entry.textPreview?.length,
      textLen: entry.text?.length,
      bodyHashLen: entry.bodyHash?.length,
      hasMedia: entry.hasMedia,
      mediaRefs: entry.mediaRefs,
      platforms: entry.platforms,
      blueskyResult: entry.results?.bluesky,
    },
    mediaCount,
  };
});

console.log('[verify] audit:', JSON.stringify(audit, null, 2));

const failures = [];
if (!audit.ok) {
  failures.push(audit.reason);
} else {
  const e = audit.entry;
  if (e.version !== 1) failures.push(`expected version=1, got ${e.version}`);
  if (typeof e.textLen !== 'number' || e.textLen !== text.length) failures.push(`text length ${e.textLen} !== ${text.length}`);
  if (typeof e.bodyHashLen !== 'number' || e.bodyHashLen !== 64) failures.push(`bodyHash length ${e.bodyHashLen}, expected 64`);
  if (!e.blueskyResult) failures.push('results.bluesky missing');
  if (e.blueskyResult && e.blueskyResult.success && !e.blueskyResult.postId) failures.push('postId not extracted from Bluesky URL');
  if (keepMedia) {
    if (!Array.isArray(e.mediaRefs) || e.mediaRefs.length === 0) failures.push('mediaRefs empty despite keepMedia ON');
    if (audit.mediaCount <= 0) failures.push(`IndexedDB media count ${audit.mediaCount}, expected > 0`);
  } else {
    if (e.mediaRefs !== undefined) failures.push(`mediaRefs should be undefined when keepMedia OFF, got ${JSON.stringify(e.mediaRefs)}`);
  }
}

// CDP attach 時は外部 chromium を閉じない
if (!cdpEndpoint) {
  await ctx.close();
} else if (browser) {
  await browser.close();
}

if (failures.length) {
  console.error(`\n✗ FAIL (${failures.length} issue(s)):`);
  failures.forEach((f) => console.error(`  - ${f}`));
  process.exit(1);
} else {
  console.log('\n✓ PASS: schema v1 + postId capture verified');
  process.exit(0);
}
