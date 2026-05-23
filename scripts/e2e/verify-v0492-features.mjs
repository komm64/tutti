/**
 * v0.4.86 / v0.4.90 の UI を Surface 実機で観察:
 * 1. 失敗 hint card (v0.4.86): SW から fake POST_RESULT を broadcast し、 popup
 *    の ✗ ⓘ click で card が開くか
 * 2. 動画 trim button (v0.4.90): draft storage に 90s video を inject、 TikTok を
 *    selected にしておき、 「N 秒に切り詰めて投稿 ✂」 button が現れるか
 */
import puppeteer from 'puppeteer-core';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';

const browser = await puppeteer.connect({
  browserURL: 'http://localhost:9222',
  defaultViewport: null,
  protocolTimeout: 60000,
});
const EXT_ID = 'dophemlpjldcejjdjefpjbgngodopkfe';

let sw = browser.targets().find((t) => t.type() === 'service_worker' && t.url().includes(EXT_ID));
if (!sw) {
  const p = await browser.newPage();
  try { await p.goto(`chrome-extension://${EXT_ID}/popup.html`, { timeout: 8000 }); } catch {}
  for (let i = 0; i < 50; i++) {
    sw = browser.targets().find((t) => t.type() === 'service_worker' && t.url().includes(EXT_ID));
    if (sw) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  await p.close().catch(() => {});
}
const worker = await sw.worker();

// 0. v0.4.90 動画 trim button verify: storage.session に 90s 動画 draft を入れる
console.log('=== v0.4.90 trim button ===');
const tinyVideoB64 = readFileSync(resolve(process.cwd(), 'scripts/e2e/fixtures/test-video.mp4')).toString('base64');
await worker.evaluate(async ({ data }) => {
  await chrome.storage.session.set({
    draft: {
      text: 'trim verify',
      selected: { tiktok: true, x: true },
      images: [],
      video: { name: 'test-90s.mp4', type: 'video/mp4', data, durationS: 90 },
    },
  });
}, { data: tinyVideoB64 });

// popup 開く (新規 popup で draft が読み込まれる)
let popup = await browser.newPage();
await popup.goto(`chrome-extension://${EXT_ID}/popup.html`, { waitUntil: 'domcontentloaded', timeout: 15000 });
await new Promise((r) => setTimeout(r, 2500));
await popup.bringToFront();

const trimUi = await popup.evaluate(() => {
  const trimBtn = Array.from(document.querySelectorAll('button')).find((b) => /切り詰めて投稿|Trim to/i.test(b.textContent ?? ''));
  return {
    videoPreviewShown: !!Array.from(document.querySelectorAll('p')).find((p) => /test-90s\.mp4/.test(p.textContent ?? '')),
    trimButtonShown: !!trimBtn,
    trimButtonText: trimBtn?.textContent?.trim() ?? null,
  };
});
console.log(JSON.stringify(trimUi, null, 2));

// 「切り詰めて投稿」 を click して set 状態確認
if (trimUi.trimButtonShown) {
  await popup.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find((b) => /切り詰めて投稿|Trim to/i.test(b.textContent ?? ''));
    btn?.click();
  });
  await new Promise((r) => setTimeout(r, 500));
  const afterClick = await popup.evaluate(() => {
    const setText = Array.from(document.querySelectorAll('p')).find((p) => /切り詰めて投稿します|Will trim to/i.test(p.textContent ?? ''));
    return setText?.textContent?.trim() ?? null;
  });
  console.log('after trim click:', afterClick);
}

// screenshot
await popup.screenshot({ path: resolve(process.cwd(), 'scripts/e2e/v0492-trim.png'), fullPage: true });
console.log('trim screenshot saved');

// ── v0.4.86 失敗 hint card ──
console.log('\n=== v0.4.86 failure hint card ===');
// SW から PLATFORM_PROGRESS broadcast で popup に fake fail を流す
await worker.evaluate(async () => {
  await chrome.runtime.sendMessage({
    type: 'PLATFORM_PROGRESS',
    result: {
      type: 'POST_RESULT',
      platform: 'x',
      success: false,
      error: '投稿入力欄が見つかりませんでした。ログイン済みか確認してください',
    },
  });
});
await new Promise((r) => setTimeout(r, 1500));

// ✗ ⓘ button を click して card 表示
const beforeClickFail = await popup.evaluate(() => {
  const failBtn = Array.from(document.querySelectorAll('button')).find((b) => /✗ ⓘ/.test(b.textContent ?? ''));
  return { failButtonShown: !!failBtn, failText: failBtn?.textContent?.trim() ?? null };
});
console.log('before click:', JSON.stringify(beforeClickFail));

if (beforeClickFail.failButtonShown) {
  await popup.evaluate(() => {
    const failBtn = Array.from(document.querySelectorAll('button')).find((b) => /✗ ⓘ/.test(b.textContent ?? ''));
    failBtn?.click();
  });
  await new Promise((r) => setTimeout(r, 500));
  const cardState = await popup.evaluate(() => {
    const cardText = document.body.innerText;
    return {
      reasonVisible: /ログインが必要|Login required|アカウント|account/i.test(cardText),
      ctaButtons: Array.from(document.querySelectorAll('button')).filter((b) => {
        const t = b.textContent ?? '';
        return /もう一度試す|Retry|を開く|Open/i.test(t);
      }).map((b) => (b.textContent ?? '').trim()),
    };
  });
  console.log('hint card:', JSON.stringify(cardState, null, 2));
}

await popup.screenshot({ path: resolve(process.cwd(), 'scripts/e2e/v0492-failhint.png'), fullPage: true });
console.log('failure hint screenshot saved');

browser.disconnect();
console.log('\n=== verify done ===');
