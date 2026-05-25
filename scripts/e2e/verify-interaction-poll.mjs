// v0.5.10 Surface verify: interaction polling end-to-end
//
// 1. notifyInteractions=true をセット
// 2. 既存の history entry (Bluesky URL あり) をベースに manual poll を発火
// 3. snapshots に counts が書き込まれることを確認
// 4. lastNotified を意図的に下げて再 poll → notification.create が走る
//
// Notes:
// - Surface 上の bsky.app に test 垢が login 済 (history に Bluesky URL がある前提)
// - manual poll は bg の SW 内で runPollCycle() を直接 evaluate して呼ぶ
//
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
await page.goto(`chrome-extension://${extId}/options.html`);
await page.waitForTimeout(800);

const ver = await page.evaluate(() => chrome.runtime.getManifest().version);
console.log(`[verify] version=${ver}`);

// Step 1: notifyInteractions ON にする
await page.evaluate(async () => {
  const s = (await chrome.storage.sync.get('settings'))['settings'] ?? {};
  await chrome.storage.sync.set({ settings: { ...s, notifyInteractions: true } });
});
await page.waitForTimeout(800);

// alarm がセットされたか
const alarmCheck = await page.evaluate(async () => {
  const alarms = await chrome.alarms.getAll();
  return alarms.map((a) => ({ name: a.name, periodInMinutes: a.periodInMinutes }));
});
console.log(`[verify] alarms after toggle=`, JSON.stringify(alarmCheck));

// 履歴に Bluesky URL のあるエントリがあるか
const histCheck = await page.evaluate(async () => {
  const h = (await chrome.storage.local.get('postHistory'))['postHistory'] ?? [];
  const bskyEntries = h.filter((e) => e.results?.bluesky?.url);
  return { totalEntries: h.length, blueskyEntries: bskyEntries.length, sample: bskyEntries[0]?.results?.bluesky?.url ?? null };
});
console.log(`[verify] history:`, JSON.stringify(histCheck));

if (histCheck.blueskyEntries === 0) {
  console.log('[verify] no Bluesky entries — bootstrapping a synthetic one');
  await page.evaluate(async () => {
    const now = Date.now();
    const entry = {
      version: 1,
      id: 'synthetic-bsky',
      textPreview: 'tutti v0.5.10 interaction poll test',
      text: 'tutti v0.5.10 interaction poll test',
      platforms: ['bluesky'],
      results: { bluesky: { success: true, url: 'https://bsky.app/profile/bsky.app/post/3lbvbmwwcyz2g' } },
      hasMedia: false,
      timestamp: now,
    };
    await chrome.storage.local.set({ postHistory: [entry] });
  });
}

// Step 2: SW 内で runPollCycle を直接呼ぶ
const sw = ctx.serviceWorkers().find((s) => s.url().startsWith(`chrome-extension://${extId}/`));
if (!sw) { console.error('no SW'); process.exit(2); }

const pollResult = await sw.evaluate(async () => {
  // syncWatchedPostsFromHistory + runPollCycle は module だが、 bg は bundle 済
  // import 経路が無いので、 chrome.alarms.create で 1 min 後に発火させる
  // …は時間掛かるので、 直接 snapshot を読みつつ alarm を発火させる別 path
  await chrome.alarms.clear('tutti-interaction-poll');
  await chrome.alarms.create('tutti-interaction-poll', { delayInMinutes: 0.1 });
  return { armed: true };
});
console.log(`[verify] alarm armed for 6s, waiting...`);

await new Promise((r) => setTimeout(r, 12000));

const snapshotsCheck = await page.evaluate(async () => {
  return (await chrome.storage.local.get('interactionSnapshots'))['interactionSnapshots'] ?? {};
});
console.log(`[verify] snapshots after poll:`, JSON.stringify(snapshotsCheck, null, 2).slice(0, 800));

// Step 4: 通知発火テスト — lastNotified を意図的に下げて再 poll
const blueskyKeys = Object.keys(snapshotsCheck).filter((k) => k.startsWith('bluesky:'));
if (blueskyKeys.length > 0) {
  const k = blueskyKeys[0];
  console.log(`[verify] force-trigger notification for ${k}`);
  await page.evaluate(async (key) => {
    const snap = (await chrome.storage.local.get('interactionSnapshots'))['interactionSnapshots'];
    if (snap[key]?.counts) {
      snap[key].lastNotified = { likes: 0, replies: 0, reposts: 0 };
      snap[key].lastChecked = undefined;
      await chrome.storage.local.set({ interactionSnapshots: snap });
    }
  }, k);

  // 再 alarm 発火
  await sw.evaluate(async () => {
    await chrome.alarms.clear('tutti-interaction-poll');
    await chrome.alarms.create('tutti-interaction-poll', { delayInMinutes: 0.1 });
  });
  await new Promise((r) => setTimeout(r, 12000));

  const after = await page.evaluate(async () => {
    return (await chrome.storage.local.get('interactionSnapshots'))['interactionSnapshots'] ?? {};
  });
  console.log(`[verify] snapshots after forced delta:`, JSON.stringify(after[k], null, 2));
}

await ctx.close();

const failures = [];
if (alarmCheck.length === 0) failures.push('alarm not set after toggle ON');
if (Object.keys(snapshotsCheck).length === 0) failures.push('no interaction snapshots after poll cycle');
const sampleSnap = Object.values(snapshotsCheck)[0];
if (sampleSnap && !sampleSnap.counts) failures.push('snapshot exists but no counts (API poll failed)');

if (failures.length) {
  console.error('\n✗ FAIL:');
  failures.forEach((f) => console.error(`  - ${f}`));
  process.exit(1);
}
console.log('\n✓ PASS: interaction polling end-to-end');
