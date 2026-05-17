/**
 * Instagram E2E smoke via CDP attach + 詳細 diag (Surface 実機)
 *
 * 用途: IG が一度も成功しない問題を debug。各 wizard step を進めながら DOM を
 * snapshot し、どの step で詰まるか特定する。
 *
 * 前提: Tutti-test-login.bat で Chromium が CDP 9222 で起動済、IG ログイン済。
 *
 *   node scripts/e2e/cdp-attach-instagram.mjs
 *
 * autoPost (実投稿) は環境変数 IG_AUTOPOST=1 で有効化。default は dry-run。
 */

import puppeteer from 'puppeteer-core';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';

async function discoverWsEndpoint() {
  const res = await fetch('http://localhost:9222/json/version').catch(() => null);
  if (!res || !res.ok) {
    throw new Error('IG CDP: localhost:9222 に Chromium が見つからない');
  }
  const data = await res.json();
  return data.webSocketDebuggerUrl;
}

const ws = await discoverWsEndpoint();
console.log(`[ig-cdp] connecting to ${ws}`);
const browser = await puppeteer.connect({ browserWSEndpoint: ws, defaultViewport: null });

let pages = await browser.pages();
let igPages = pages.filter((p) => /instagram\.com/.test(p.url()));
console.log(`[ig-cdp] found ${igPages.length} IG tab(s)`);
// 複数あったら最初以外を close (snapshot と Tutti 操作のタブを一致させる)
for (let i = 1; i < igPages.length; i++) {
  console.log(`[ig-cdp] closing extra IG tab #${i}`);
  await igPages[i].close().catch(() => {});
}
let igPage = igPages[0];
if (!igPage) {
  console.log('[ig-cdp] no IG tab, creating new');
  igPage = await browser.newPage();
  await igPage.goto('https://www.instagram.com/', { waitUntil: 'domcontentloaded', timeout: 30000 });
}

// IG タブのコンソール log を収集 (inject-helper / content script の log を見る)
const consoleLog = [];
igPage.on('console', (m) => {
  const txt = `[ig:${m.type()}] ${m.text()}`;
  consoleLog.push(txt);
  if (m.text().includes('[Tutti') || m.type() === 'error') {
    console.log(txt);
  }
});
igPage.on('pageerror', (e) => {
  const txt = `[ig:pageerror] ${e.message}`;
  consoleLog.push(txt);
  console.log(txt);
});

// 常に home に再 navigate して clean state を確保 (前回試行の残滓 dialog を片付ける)
console.log(`[ig-cdp] navigating IG to home (current: ${igPage.url()}) for clean state`);
await igPage.goto('https://www.instagram.com/', { waitUntil: 'domcontentloaded', timeout: 30000 });
await new Promise((r) => setTimeout(r, 4000)); // sidebar render 待ち

await igPage.bringToFront();
// 念のため Escape を 2 回押して残った dialog を閉じる
await igPage.keyboard.press('Escape').catch(() => {});
await new Promise((r) => setTimeout(r, 300));
await igPage.keyboard.press('Escape').catch(() => {});
await new Promise((r) => setTimeout(r, 500));

// 拡張 ID を CDP の page list から拾う (extension SW がアイドルでも、page list の
// faviconUrl 等から chrome-extension:// URL があれば取れる)。
// Tutti は load 済前提。SW が sleep してたら popup を navigate して wake する。
let extId = 'dophemlpjldcejjdjefpjbgngodopkfe';
async function findSw() {
  return browser.targets().find((t) =>
    t.type() === 'service_worker' && t.url().includes(`chrome-extension://${extId}/`),
  );
}

let swTarget = await findSw();
if (!swTarget) {
  console.log(`[ig-cdp] Tutti SW idle, waking via popup.html navigation`);
  // chrome.runtime.reload() 直後など 5s では足りないケースがあるので、
  // popup を 3 回 navigate + 最大 20s 待つ
  for (let attempt = 1; attempt <= 3 && !swTarget; attempt++) {
    const wakePage = await browser.newPage();
    try {
      await wakePage.goto(`chrome-extension://${extId}/popup.html`, { timeout: 10000 });
    } catch (e) {
      // popup.html は MV3 だと action popup として開かれる前提
    }
    for (let i = 0; i < 70; i++) {
      swTarget = await findSw();
      if (swTarget) break;
      await new Promise((r) => setTimeout(r, 100));
    }
    await wakePage.close().catch(() => {});
    if (!swTarget) console.log(`  attempt ${attempt}: SW not yet visible, retrying...`);
  }
}
if (!swTarget) {
  console.error('[ig-cdp] FAIL: Tutti 拡張 SW を wake できなかった (Tutti が load されてない可能性)');
  browser.disconnect();
  process.exit(2);
}
const worker = await swTarget.worker();
console.log(`[ig-cdp] attached to SW: ${swTarget.url()}`);

const imagePath = resolve(process.cwd(), 'scripts/e2e/fixtures/test-image.jpg');
const imgB64 = readFileSync(imagePath).toString('base64');
const text = `tutti ig diag ${new Date().toISOString()}`;
const autoPost = process.env.IG_AUTOPOST === '1';

console.log(`[ig-cdp] sending POST_TO_PLATFORM (autoPost=${autoPost}, dryRun=${!autoPost})`);

// background は sendMessage を broadcast するが、ここでは content script に
// 直接 POST_TO_PLATFORM を投げて IG の content-script 自身の挙動を観察。
// dryRun: true で start (autoPost=false 相当)、Share の click 直前で止まる。
const sendStart = Date.now();
const sendPromise = worker.evaluate(async ({ text, imgB64, dryRun }) => {
  const tabs = await chrome.tabs.query({ url: 'https://*.instagram.com/*' });
  const tab = tabs[0];
  if (!tab) return { ok: false, error: 'no IG tab' };
  let result, errMsg;
  try {
    result = await chrome.tabs.sendMessage(tab.id, {
      type: 'POST_TO_PLATFORM',
      platform: 'instagram',
      text,
      images: [{
        name: 'test.jpg',
        type: 'image/jpeg',
        data: imgB64,
        bytes: Math.floor(imgB64.length * 0.75),
      }],
      dryRun,
    });
  } catch (e) {
    errMsg = (e && e.message) ? e.message : String(e);
  }
  return { ok: result?.success === true, raw: result, error: errMsg };
}, { text, imgB64, dryRun: !autoPost });

// 並行で DOM snapshot を周期的に取って、wizard step がどこまで進んだか追跡
const snapshots = [];
let snapTimer;
const snapshotDialog = async (label) => {
  try {
    const snap = await igPage.evaluate(() => {
      const dialogs = Array.from(document.querySelectorAll('[role="dialog"]'));
      return {
        url: location.href,
        dialogCount: dialogs.length,
        dialogs: dialogs.map((d) => {
          const buttons = Array.from(d.querySelectorAll('button, [role="button"]'))
            .map((b) => {
              const t = (b.textContent || '').trim().slice(0, 30);
              const aria = b.getAttribute('aria-label') || '';
              const disabled = b.disabled || b.getAttribute('aria-disabled') === 'true';
              return { t, aria, disabled };
            })
            .filter((b) => b.t || b.aria);
          const fileInputs = d.querySelectorAll('input[type="file"]').length;
          const captionEd = !!d.querySelector('div[contenteditable="true"]');
          const aria = d.getAttribute('aria-label') || '';
          return {
            aria,
            fileInputs,
            captionEd,
            buttons: buttons.slice(0, 8),
            textHead: (d.textContent || '').slice(0, 200),
          };
        }),
        // sidebar の Create trigger 候補をデバッグ用に列挙
        createTriggers: Array.from(document.querySelectorAll('svg[aria-label*="post" i], svg[aria-label*="新規" i], svg[aria-label*="Create" i], a[aria-label*="post" i], a[aria-label*="Create" i]')).slice(0, 5).map((el) => {
          const aria = (el.getAttribute('aria-label') || '').slice(0, 40);
          const parent = el.closest('a, button, [role="link"], [role="button"]');
          return { tag: el.tagName, aria, hasClickableParent: !!parent };
        }),
      };
    });
    snapshots.push({ at: Date.now() - sendStart, label, ...snap });
  } catch (e) {
    snapshots.push({ at: Date.now() - sendStart, label, error: String(e) });
  }
};

// 初期 + 2s おき
await snapshotDialog('start');
snapTimer = setInterval(() => snapshotDialog('tick'), 2000);

const sendResult = await Promise.race([
  sendPromise,
  new Promise((resolve) => setTimeout(() => resolve({ ok: false, raw: { _timeout: true } }), 90_000)),
]);
clearInterval(snapTimer);
await snapshotDialog('end');

console.log(`[ig-cdp] sendMessage result: ${JSON.stringify(sendResult)}`);
console.log(`[ig-cdp] dialog snapshots (${snapshots.length}):`);
for (const s of snapshots) {
  console.log(`\n--- @${s.at}ms (${s.label}) url=${s.url ?? '?'} ---`);
  if (s.error) {
    console.log(`  error: ${s.error}`);
    continue;
  }
  if (s.createTriggers && s.createTriggers.length > 0) {
    console.log(`  create triggers candidates:`);
    for (const t of s.createTriggers) {
      console.log(`    <${t.tag}> aria="${t.aria}" parentClickable=${t.hasClickableParent}`);
    }
  }
  if (!s.dialogs || s.dialogs.length === 0) {
    console.log('  (no dialog visible)');
  } else {
    for (const d of s.dialogs) {
      console.log(`  dialog aria="${d.aria}" file=${d.fileInputs} caption=${d.captionEd}`);
      console.log(`    text: ${d.textHead.replace(/\s+/g, ' ').slice(0, 150)}`);
      for (const b of d.buttons) {
        console.log(`    btn: "${b.t}" aria="${b.aria}" disabled=${b.disabled}`);
      }
    }
  }
}
console.log(`\n[ig-cdp] console log (last 30 of ${consoleLog.length}):`);
for (const c of consoleLog.slice(-30)) console.log(`  ${c}`);

browser.disconnect();
process.exit(sendResult.ok ? 0 : 1);
