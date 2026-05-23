/**
 * v0.4.94 inline thread compose verify (X + Bluesky)。
 * preview mode で chunks > 1 を flow して、 X / Bluesky の compose に複数 chunks が
 * 並ぶ (= 「+」 button 経由で thread 化される) か観察。
 *
 * Tutti popup → background → content script の経路で textChunks が渡るので、
 * background.postSingleChunkInlineThread → content script の runPost(textChunks)
 * → X/Bluesky の executeXInlineThread / executeBlueskyInlineThread が走る。
 */
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.connect({
  browserURL: 'http://localhost:9222',
  defaultViewport: null,
  protocolTimeout: 120000,
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

// 長い text を作って X 280 / Bluesky 300 char 超で 2 chunk 化される状態を作る
const longText = `Chunk demo: ${'A '.repeat(160)}END`;
console.log(`longText length: ${longText.length} chars`);

// X tab を /home に navigate (content script load 確実に)
const pages0 = await browser.pages();
let xPagePre = pages0.find((p) => /x\.com/.test(p.url()));
if (!xPagePre) xPagePre = await browser.newPage();
await xPagePre.goto('https://x.com/home', { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
await xPagePre.bringToFront();
await new Promise((r) => setTimeout(r, 4000));

// X test: 直接 content script に textChunks 付き POST_TO_PLATFORM 送信
console.log('\n=== X inline thread (preview) ===');
const chunks = [
  `Chunk demo (1/2): ${'A '.repeat(80)}END`,
  `Chunk demo (2/2): ${'B '.repeat(80)}END`,
];
const xResult = await worker.evaluate(async ({ chunks }) => {
  const tabs = await chrome.tabs.query({ url: 'https://x.com/*' });
  if (!tabs[0]) return { error: 'no X tab' };
  return await chrome.tabs.sendMessage(tabs[0].id, {
    type: 'POST_TO_PLATFORM',
    platform: 'x',
    text: chunks[0],
    textChunks: chunks,
    dryRun: true,
  });
}, { chunks });
console.log('X result:', JSON.stringify(xResult, null, 2));

// X compose page で chunk が何個並んでるか確認
const pages = await browser.pages();
const xPage = pages.find((p) => /x\.com/.test(p.url()));
if (xPage) {
  await xPage.bringToFront();
  await new Promise((r) => setTimeout(r, 4000));
  const xCompose = await xPage.evaluate(() => {
    const textareas = Array.from(document.querySelectorAll('[data-testid^="tweetTextarea_"][contenteditable="true"]'));
    return {
      textareaCount: textareas.length,
      texts: textareas.slice(0, 5).map((t) => (t.textContent ?? '').slice(0, 50)),
    };
  });
  console.log('X compose state:', JSON.stringify(xCompose, null, 2));
} else {
  console.log('X tab が無い');
}

await new Promise((r) => setTimeout(r, 1500));

// Bluesky tab を /intent/compose に navigate (compose modal 開いた状態で test)
let bskyPagePre = (await browser.pages()).find((p) => /bsky\.app/.test(p.url()));
if (!bskyPagePre) bskyPagePre = await browser.newPage();
await bskyPagePre.goto('https://bsky.app/intent/compose?text=', { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
await bskyPagePre.bringToFront();
await new Promise((r) => setTimeout(r, 4500));

console.log('\n=== Bluesky inline thread (preview) ===');
const bskyResult = await worker.evaluate(async ({ chunks }) => {
  const tabs = await chrome.tabs.query({ url: 'https://bsky.app/*' });
  if (!tabs[0]) return { error: 'no Bsky tab' };
  return await chrome.tabs.sendMessage(tabs[0].id, {
    type: 'POST_TO_PLATFORM',
    platform: 'bluesky',
    text: chunks[0],
    textChunks: chunks,
    dryRun: true,
  });
}, { chunks });
console.log('Bsky result:', JSON.stringify(bskyResult, null, 2));

const bskyPages = await browser.pages();
const bskyPage = bskyPages.find((p) => /bsky\.app/.test(p.url()));
if (bskyPage) {
  await bskyPage.bringToFront();
  await new Promise((r) => setTimeout(r, 4000));
  const bskyCompose = await bskyPage.evaluate(() => {
    const textareas = Array.from(document.querySelectorAll('[contenteditable="true"][role="textbox"]'));
    return {
      textareaCount: textareas.length,
      texts: textareas.slice(0, 5).map((t) => (t.textContent ?? '').slice(0, 50)),
    };
  });
  console.log('Bsky compose state:', JSON.stringify(bskyCompose, null, 2));
}

browser.disconnect();
