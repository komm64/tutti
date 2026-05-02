/**
 * Tutti E2E real-post smoke test runner
 *
 * 各 SNS に対して、ビルド済 .output/chrome-mv3 拡張をロードした persistent
 * Chrome を起動し、test 垢でログイン済プロフィールから実際に投稿し、削除する。
 *
 * 使用前提:
 *   - .output/chrome-mv3 が `npm run build` 済 (workflow が事前に build する)
 *   - $E2E_USER_DATA_DIR にテスト垢でログイン済の Chrome user-data dir が居る
 *   - Ubuntu CLI なら xvfb-run で wrap して実行
 *
 * 使い方:
 *   node scripts/e2e/run.mjs --platforms x,bluesky
 *   node scripts/e2e/run.mjs --platforms x --debug   # ヘッドフル + slow + Inspector
 */

import { chromium } from 'playwright';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..', '..');
const extensionDir = resolve(repoRoot, '.output', 'chrome-mv3');

const args = process.argv.slice(2);
const debug = args.includes('--debug');
const platformsIdx = args.indexOf('--platforms');
const platforms = platformsIdx >= 0 ? (args[platformsIdx + 1] ?? 'x').split(',') : ['x'];

const userDataDir = process.env.E2E_USER_DATA_DIR
  ?? resolve(process.env.HOME ?? process.env.USERPROFILE ?? '/tmp', '.tutti-e2e-chrome');

if (!existsSync(extensionDir)) {
  console.error(`[e2e] extension dir not found: ${extensionDir}`);
  console.error('[e2e] Run `npm run build` first.');
  process.exit(2);
}

console.log(`[e2e] platforms=${platforms.join(',')} debug=${debug}`);
console.log(`[e2e] user-data-dir=${userDataDir}`);
console.log(`[e2e] extension=${extensionDir}`);

// 各 platform の test module を dynamic import
const results = [];
for (const platform of platforms) {
  const modulePath = resolve(__dirname, 'platforms', `${platform}.mjs`);
  if (!existsSync(modulePath)) {
    console.error(`[e2e] no test module for platform: ${platform} (expected ${modulePath})`);
    results.push({ platform, ok: false, error: 'no test module' });
    continue;
  }
  console.log(`[e2e] launching Chrome for ${platform}...`);
  const ctx = await chromium.launchPersistentContext(userDataDir, {
    headless: false, // anti-bot: 必ず headful (Xvfb で virtual display 提供)
    slowMo: debug ? 250 : 0,
    args: [
      `--disable-extensions-except=${extensionDir}`,
      `--load-extension=${extensionDir}`,
      '--no-first-run',
      '--no-default-browser-check',
    ],
  });
  // Chrome 拡張 ID は load 時に決まる。chrome.runtime ID をポップアップから取得すると
  // 信頼できる ($E2E_EXTENSION_ID で override も可)
  const extensionId = process.env.E2E_EXTENSION_ID ?? await detectExtensionId(ctx);
  console.log(`[e2e] extension id=${extensionId}`);

  let result;
  try {
    const mod = await import(`./platforms/${platform}.mjs`);
    result = await mod.run({ ctx, extensionId, debug });
    console.log(`[e2e] ${platform}: ${result.ok ? 'PASS' : 'FAIL'} ${result.note ?? ''}`);
  } catch (e) {
    result = { ok: false, error: e?.message ?? String(e) };
    console.error(`[e2e] ${platform}: ERROR`, e);
  } finally {
    await ctx.close();
  }
  results.push({ platform, ...result });
}

console.log('\n[e2e] === Summary ===');
let allOk = true;
for (const r of results) {
  console.log(`  ${r.platform}: ${r.ok ? '✓' : '✗'} ${r.error ?? r.note ?? ''}`);
  if (!r.ok) allOk = false;
}
process.exit(allOk ? 0 : 1);

async function detectExtensionId(ctx) {
  // chrome://extensions/ の DOM から id を取る (Manifest V3)
  // service worker URL が `chrome-extension://<id>/...` 形式なので、ctx の
  // serviceWorkers() から id 抽出する方が速くて壊れにくい
  for (let i = 0; i < 30; i++) {
    const sws = ctx.serviceWorkers();
    for (const sw of sws) {
      const url = sw.url();
      const m = url.match(/^chrome-extension:\/\/([a-z]+)\//);
      if (m) return m[1];
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('failed to detect extension id (service worker not found)');
}
