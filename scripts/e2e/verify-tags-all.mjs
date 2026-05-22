/**
 * v0.4.71 / v0.4.72 / v0.4.73 未検証 fix の Surface 実機検証。
 *   - Tumblr: textarea[aria-label="Tags editor"] に tags chip が commit されるか
 *   - DeviantArt: description editor が lazy-mount で見つかる + tags chip 注入
 *   - YouTube: Show more 展開 + tags chip 注入
 *
 * 各 SNS で Tutti dry-run + DOM probe。 chip 化された tag を確認する。
 *
 * Usage: PLATFORM=tumblr|deviantart|youtube node scripts/e2e/verify-tags-all.mjs
 */
import puppeteer from 'puppeteer-core';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';

const PLATFORM = (process.env.PLATFORM || 'tumblr').trim();
const TEST_TEXT = 'Tutti verify #cats #photography #beautiful #goldenhour\n\nLook at this scene!';

const browser = await puppeteer.connect({
  browserURL: 'http://localhost:9222',
  defaultViewport: null,
  protocolTimeout: 180000,
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

const startUrls = {
  tumblr: 'https://www.tumblr.com/new/text',
  deviantart: 'https://www.deviantart.com/studio?new=1',
  youtube: 'https://studio.youtube.com/',
};
const matchHosts = {
  tumblr: /tumblr\.com/,
  deviantart: /deviantart\.com/,
  youtube: /youtube\.com/,
};

// page.goto は domcontentloaded まで待たず timeout 短め (DA / YT Studio の
// 全 load を待つと 60s 超え)。 開始だけ trigger して puppeteer 側は console と
// 最終 DOM probe にだけ使う。 SW 側 openOrFocusTab は別途進行。
const pages = await browser.pages();
let page = pages.find((p) => matchHosts[PLATFORM].test(p.url()));
if (!page) page = await browser.newPage();
await page.bringToFront();
// 20s 試す。 timeout でも navigation は trigger 済の可能性、 catch して続行
await page.goto(startUrls[PLATFORM], { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {});
await page.bringToFront();
await new Promise((r) => setTimeout(r, 6000));
// SW から再確認: tab が target URL に navigate してるか
try {
  const url = await page.url();
  console.log(`page url after goto: ${url}`);
} catch {}

const logs = [];
page.on('console', (m) => {
  const t = m.text();
  if (/Tutti|tutti/i.test(t)) logs.push(`[${m.type()}] ${t}`);
});

const imgB64 = readFileSync(resolve(process.cwd(), 'scripts/e2e/fixtures/test-image.jpg')).toString('base64');
console.log(`[${PLATFORM}] sending dry-run with text=${TEST_TEXT.slice(0, 50)}...`);
const result = await worker.evaluate(async ({ text, imgB64, platform }) => {
  const urls = {
    tumblr: 'https://*.tumblr.com/*',
    deviantart: 'https://*.deviantart.com/*',
    youtube: 'https://*.youtube.com/*',
  };
  const tabs = await chrome.tabs.query({ url: urls[platform] });
  if (!tabs[0]) return { error: 'no tab' };
  // YouTube only takes video (kinds=['shortVideo']) so image won't work; use video for YT
  // 簡略: image だけ送る (YouTube は image NG なので fail するが、 検証は dry-run 完走前まで)
  return await chrome.tabs.sendMessage(tabs[0].id, {
    type: 'POST_TO_PLATFORM', platform,
    text, dryRun: true,
    images: platform === 'youtube' ? [] : [{ name: 't.jpg', type: 'image/jpeg', data: imgB64, bytes: Math.floor(imgB64.length * 0.75) }],
  });
}, { text: TEST_TEXT, imgB64, platform: PLATFORM });

console.log(`\nresult:`, JSON.stringify(result, null, 2));

// dry-run 後の DOM 状態を probe (tag chip が表示されてるか)
await new Promise((r) => setTimeout(r, 1500));
const tagState = await page.evaluate((platform) => {
  if (platform === 'tumblr') {
    const ta = document.querySelector('[role="dialog"] textarea[aria-label="Tags editor"]');
    return {
      tagsTextarea: !!ta,
      tagsValue: ta?.value,
      chipsArea: (() => {
        // chip 化された tag 要素を探す (Tumblr は通常 visual に区切られる)
        const parent = ta?.parentElement;
        return parent ? (parent.innerText ?? '').slice(0, 300) : null;
      })(),
    };
  } else if (platform === 'deviantart') {
    const tagInput = document.querySelector('input[name="tags"], input[aria-label*="tag" i]');
    return {
      tagInput: !!tagInput,
      tagInputValue: tagInput?.value,
      // 周辺の chips
      surroundingText: tagInput?.parentElement?.parentElement?.innerText?.slice(0, 400),
    };
  } else if (platform === 'youtube') {
    const tagInput = document.querySelector('#tags-input #text-input, ytcp-form-input-container input');
    return {
      tagInput: !!tagInput,
      tagInputValue: tagInput?.value,
      surroundingText: tagInput?.parentElement?.parentElement?.innerText?.slice(0, 400),
    };
  }
  return { error: 'unknown platform' };
}, PLATFORM);
console.log('\ntag state after dry-run:');
console.log(JSON.stringify(tagState, null, 2));

console.log(`\n=== ${logs.length} Tutti console logs ===`);
for (const l of logs) console.log(l);

browser.disconnect();
