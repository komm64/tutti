/**
 * v0.4.65 で修正した 3 バグの実機検証 (Surface dummy 垢)。
 *
 * シナリオ:
 *   1. X: 350 char + image → thread post (chunk 0 + 1 を 1 compose にまとめて投稿)
 *   2. Bluesky: 400 char + image → 2 chunk 順次投稿。 chunk 0 silent fail せず
 *      両方ともポストできるか。
 *   3. Instagram: 100 char + image → caption が空白でなくきちんと反映されるか。
 *
 * 実行方法: Surface 上で
 *   node scripts/e2e/test-multichunk-bugs.mjs
 *
 * 前提:
 *   - Brave が 9222 で起動済 (tutti-brave-launch schtask)
 *   - .tutti-e2e-chrome user-data-dir にダミー垢ログイン済
 *   - .output/chrome-mv3 が v0.4.65 build 済
 *
 * env: AUTOPOST=1 で実投稿。 default は dry-run (検証ロジックだけ走らせて
 *      Post button click 直前で止まる)。
 */

import puppeteer from 'puppeteer-core';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';

const AUTOPOST = process.env.AUTOPOST === '1';
const PLATFORM_FILTER = process.env.PLATFORM ?? ''; // 'x', 'bluesky', 'instagram', or empty for all

async function discoverWsEndpoint() {
  const res = await fetch('http://localhost:9222/json/version').catch(() => null);
  if (!res || !res.ok) throw new Error('CDP localhost:9222 に接続できない');
  const data = await res.json();
  return data.webSocketDebuggerUrl;
}

const ws = await discoverWsEndpoint();
console.log(`[cdp] connecting`);
const browser = await puppeteer.connect({ browserWSEndpoint: ws, defaultViewport: null });

// 拡張 ID は Tutti が unpacked load される際に固定 (mv3 manifest key 由来)
const extId = 'dophemlpjldcejjdjefpjbgngodopkfe';

async function findSw() {
  return browser.targets().find((t) =>
    t.type() === 'service_worker' && t.url().includes(`chrome-extension://${extId}/`),
  );
}

async function wakeSw() {
  let sw = await findSw();
  if (sw) return sw;
  console.log('[cdp] Tutti SW が sleep、 popup で wake');
  for (let attempt = 1; attempt <= 3 && !sw; attempt++) {
    const wakePage = await browser.newPage();
    try {
      await wakePage.goto(`chrome-extension://${extId}/popup.html`, { timeout: 10000 });
    } catch {}
    for (let i = 0; i < 70; i++) {
      sw = await findSw();
      if (sw) break;
      await new Promise((r) => setTimeout(r, 100));
    }
    await wakePage.close().catch(() => {});
  }
  return sw;
}

const swTarget = await wakeSw();
if (!swTarget) {
  console.error('[cdp] FAIL: Tutti SW を wake できなかった');
  browser.disconnect();
  process.exit(2);
}
const worker = await swTarget.worker();
console.log(`[cdp] SW attached: ${swTarget.url()}`);

// popup page を開いて、 そこから chrome.runtime.sendMessage する。
// (SW から自分自身に sendMessage は届かないので、 別 context が必要)
const popupPage = await browser.newPage();
const popupLogs = [];
popupPage.on('console', (m) => {
  const t = m.text();
  popupLogs.push(`[popup ${m.type()}] ${t}`);
});
await popupPage.goto(`chrome-extension://${extId}/popup.html`, { waitUntil: 'domcontentloaded' });
await new Promise((r) => setTimeout(r, 1000));
console.log(`[cdp] popup page opened: ${popupPage.url()}`);

// fixture image (8KB JPEG)
const imgPath = resolve(process.cwd(), 'scripts/e2e/fixtures/test-image.jpg');
const imgB64 = readFileSync(imgPath).toString('base64');
console.log(`[fixture] image: ${imgB64.length} chars b64 (~${Math.round(imgB64.length * 0.75)} bytes)`);

const ts = new Date().toISOString().replace(/[:.]/g, '-');

// テキスト生成 (各 chunk が unique になるよう ts と random nonce を毎行に埋める。
// X / Bluesky など重複検出するサービスを通すため)
const nonce = Math.random().toString(36).slice(2, 10);
function makeText(len) {
  const base = `tutti-test-${ts}-${nonce} `;
  let s = base;
  let i = 0;
  while (s.length < len) {
    s += `[${nonce}-${i}] chunk${i} hello world `;
    i++;
  }
  return s.slice(0, len);
}

// autoPost 設定を確認 / 必要なら ON にする
async function setAutoPost(enabled) {
  return await worker.evaluate(async (v) => {
    const stored = await chrome.storage.local.get('settings');
    const settings = stored.settings ?? {};
    settings.autoPost = v;
    await chrome.storage.local.set({ settings });
    return settings.autoPost;
  }, enabled);
}

console.log(`[setup] autoPost ${AUTOPOST ? 'ON (実投稿)' : 'OFF (dry-run, post button click はスキップ)'}`);
await setAutoPost(AUTOPOST);

// 各シナリオを順番に走らせる
const scenarios = [
  {
    id: 'x-multichunk-image',
    platform: 'x',
    text: makeText(350), // X charLimit 280 を超え 2 chunk 化
    withImage: true,
    expect: 'thread post (1 つの compose に 2 chunk + 画像で投稿)',
  },
  {
    id: 'bluesky-multichunk-image',
    platform: 'bluesky',
    text: makeText(400), // Bluesky charLimit 300 を超え 2 chunk 化
    withImage: true,
    expect: '2 chunk 順次投稿、 chunk 0 silent fail せず両方 post',
  },
  {
    id: 'instagram-caption-fill',
    platform: 'instagram',
    // 「tutti-test-...」 のような repetitive text を IG が spam として silent
    // strip する疑いを排除するため、 自然な短いテキストで test
    text: `Live show last night was amazing #music ${ts.slice(0, 16)}`,
    withImage: true,
    expect: 'caption が空白でなく反映 (Lexical state 同期)',
  },
];

const results = [];

for (const sc of scenarios) {
  if (PLATFORM_FILTER && PLATFORM_FILTER !== sc.platform) continue;

  console.log(`\n========== [${sc.id}] ==========`);
  console.log(`platform = ${sc.platform}, text length = ${sc.text.length}`);
  console.log(`期待: ${sc.expect}`);

  const startedAt = Date.now();
  const payload = {
    type: 'POST_REQUEST',
    text: sc.text,
    platforms: [sc.platform],
    images: sc.withImage ? [{
      name: 'test.jpg',
      type: 'image/jpeg',
      data: imgB64,
      bytes: Math.floor(imgB64.length * 0.75),
    }] : [],
  };

  let final;
  try {
    // popup context から sendMessage して background.handlePostRequest を起動
    final = await popupPage.evaluate(async (msg) => {
      const response = await chrome.runtime.sendMessage(msg);
      return response;
    }, payload);
  } catch (e) {
    final = { error: e instanceof Error ? e.message : String(e) };
  }

  const elapsed = Date.now() - startedAt;
  console.log(`\n[結果] ${elapsed}ms`);
  console.log(JSON.stringify(final, null, 2));

  results.push({ ...sc, final, elapsedMs: elapsed });
}

console.log(`\n\n========== SUMMARY (autoPost=${AUTOPOST}) ==========`);
for (const r of results) {
  const succ = r.final?.results?.[0]?.success;
  const err = r.final?.results?.[0]?.error;
  const url = r.final?.results?.[0]?.url;
  const status = succ === true ? '✓' : (succ === false ? '✗' : '?');
  console.log(`${status} ${r.id} (${r.elapsedMs}ms)`);
  if (err) console.log(`  error: ${err}`);
  if (url) console.log(`  url: ${url}`);
}

browser.disconnect();
process.exit(0);
