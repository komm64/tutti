/**
 * TikTok E2E smoke via CDP attach (anti-bot session 維持版)
 *
 * 通常の `npm run e2e` (Playwright launchPersistentContext) では TikTok の
 * anti-bot が「fresh Chromium process」を判定して session を切り、login expired
 * になる。回避策: user が開いた Chromium に CDP attach することで「同じ process
 * 内で連続セッション」として扱われる (Surface 実機 2026-05-13 で検証成功)。
 *
 * ## 使い方
 *
 * 1. Surface (or Windows machine) で Tutti-test-login.bat を起動
 *    (`--remote-debugging-port=9222` 付き、test 垢 login 済 profile を使う)
 * 2. **Chromium を閉じずに** 以下を実行:
 *
 *    node scripts/e2e/cdp-attach-tiktok.mjs
 *
 *    必要なら E2E_CDP_WS で直接 WS URL を指定:
 *    E2E_CDP_WS=ws://localhost:9222/devtools/browser/<id> node ...
 *
 * ## なぜ Playwright じゃなく puppeteer-core か
 *
 * Playwright の `chromium.connectOverCDP` は拡張持ち Chromium に attach すると
 * 内部の target 列挙で hang する (Surface 実機 2026-05-13 で確認、Timeout 90s)。
 * puppeteer-core の CDP attach は即座に成功するため、共通 harness 経由で採用。
 */

import puppeteer from 'puppeteer-core';
import {
  connectPuppeteerCdp,
  disconnectCdp,
  loadE2eFixture,
  resolveCdpEndpoint,
} from './cdp-harness.mjs';

const cdpEndpoint = resolveCdpEndpoint();
console.log(`[tiktok-cdp] connecting to ${cdpEndpoint}`);
const browser = await connectPuppeteerCdp({ puppeteer, endpoint: cdpEndpoint });

let pages = await browser.pages();
let ttPage = pages.find((p) => /tiktok\.com\/tiktokstudio\/upload/.test(p.url()))
  ?? pages.find((p) => /tiktok\.com/.test(p.url()));
if (!ttPage) ttPage = await browser.newPage();

await ttPage.goto('https://www.tiktok.com/tiktokstudio/upload', { waitUntil: 'networkidle2', timeout: 60000 });
await new Promise((r) => setTimeout(r, 8000));

const fi = await ttPage.evaluate(() => !!document.querySelector('input[type="file"][accept*="video"]'));
if (!fi) {
  console.error('[tiktok-cdp] FAIL: TikTok Studio file input が見つからない (未ログイン / UI 変更?)');
  await disconnectCdp(browser);
  process.exit(2);
}

const swTarget = browser.targets().find((t) =>
  t.type() === 'service_worker' && t.url().includes('chrome-extension://'),
);
if (!swTarget) {
  console.error('[tiktok-cdp] FAIL: Tutti 拡張 SW が見つからない (拡張 load 済?)');
  await disconnectCdp(browser);
  process.exit(3);
}
const worker = await swTarget.worker();

const videoFixture = await loadE2eFixture('test-video.mp4', 'video/mp4', { required: true });
const videoB64 = videoFixture.data;
const text = `tutti e2e tiktok cdp ${new Date().toISOString()}`;

console.log(`[tiktok-cdp] sending POST_TO_PLATFORM (autoPost=false / preview)`);
const result = await worker.evaluate(async ({ text, videoB64 }) => {
  const tabs = await chrome.tabs.query({ url: 'https://*.tiktok.com/*' });
  const tab = tabs[0];
  if (!tab) return { ok: false, error: 'no tiktok tab' };
  const r = await chrome.tabs.sendMessage(tab.id, {
    type: 'POST_TO_PLATFORM',
    platform: 'tiktok',
    text,
    images: [{ name: 'test.mp4', type: 'video/mp4', data: videoB64, bytes: Math.floor(videoB64.length * 0.75), durationS: 2 }],
    autoPost: false,
  });
  return { ok: r?.success === true, raw: r };
}, { text, videoB64 });

console.log(`[tiktok-cdp] RESULT: ${JSON.stringify(result)}`);
await disconnectCdp(browser);
process.exit(result.ok ? 0 : 1);
