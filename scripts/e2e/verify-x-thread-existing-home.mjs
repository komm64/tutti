/**
 * Verify the X multi-chunk preview path when an existing https://x.com/home tab
 * is already open.
 *
 * This exercises the production route:
 *   popup page -> POST_REQUEST -> background openOrFocusTab -> x content script
 *
 * Usage:
 *   node scripts/e2e/verify-x-thread-existing-home.mjs
 *   E2E_CDP=http://localhost:9222 E2E_EXTENSION_ID=<id> node scripts/e2e/verify-x-thread-existing-home.mjs --isolate-x-tabs
 */

import { chromium } from 'playwright';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..', '..');
const extensionDir = process.env.E2E_EXT_DIR ?? resolve(repoRoot, '.output', 'chrome-mv3');
const cdpEndpoint = process.env.E2E_CDP;
const userDataDir = process.env.E2E_USER_DATA_DIR ?? resolve(repoRoot, '.tmp', 'verify-x-thread-profile');
const isolateXTabs = process.argv.includes('--isolate-x-tabs');
const skipExtensionReload = process.argv.includes('--skip-extension-reload');
const includeImage = process.argv.includes('--image') || process.argv.includes('--with-image');

let browser;
let ctx;

async function fail(message, detail) {
  console.error(`[verify-x-thread] FAIL: ${message}`);
  if (detail !== undefined) {
    console.error(JSON.stringify(detail, null, 2));
  }
  if (!cdpEndpoint && ctx) await ctx.close().catch(() => {});
  if (browser) await browser.close().catch(() => {});
  process.exit(1);
}

async function detectExtensionId(ctx) {
  const fromEnv = process.env.E2E_EXTENSION_ID;
  if (fromEnv) return fromEnv;
  for (let i = 0; i < 50; i += 1) {
    for (const worker of ctx.serviceWorkers()) {
      const m = worker.url().match(/^chrome-extension:\/\/([a-z]+)\//);
      if (m?.[1]) return m[1];
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return null;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const tag = Buffer.from(type, 'ascii');
  const body = Buffer.concat([tag, data]);
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    table[n] = c >>> 0;
  }
  let crcValue = 0xffffffff;
  for (const b of body) crcValue = table[(crcValue ^ b) & 0xff] ^ (crcValue >>> 8);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE((crcValue ^ 0xffffffff) >>> 0, 0);
  return Buffer.concat([len, body, crc]);
}

function makePng(w, h) {
  const rowSize = w * 4 + 1;
  const raw = Buffer.alloc(rowSize * h);
  for (let y = 0; y < h; y += 1) {
    raw[y * rowSize] = 0;
    for (let x = 0; x < w; x += 1) {
      const i = y * rowSize + 1 + x * 4;
      raw[i] = 32 + (x % 160);
      raw[i + 1] = 96 + (y % 120);
      raw[i + 2] = 220;
      raw[i + 3] = 255;
    }
  }
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    sig,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

async function openExtensionPage(path, attempts = 8) {
  let lastError;
  for (let i = 0; i < attempts; i += 1) {
    const page = await ctx.newPage();
    try {
      await page.goto(`chrome-extension://${extensionId}/${path}`, {
        waitUntil: 'domcontentloaded',
        timeout: 15000,
      });
      return page;
    } catch (e) {
      lastError = e;
      await page.close().catch(() => {});
      await sleep(500 + i * 250);
    }
  }
  await fail(`could not open extension page ${path}`, lastError?.message ?? String(lastError));
}

console.log(`[verify-x-thread] mode=${cdpEndpoint ? `CDP ${cdpEndpoint}` : `launch ${userDataDir}`} image=${includeImage ? 'yes' : 'no'}`);
if (!cdpEndpoint && !existsSync(extensionDir)) {
  await fail(`extension build not found: ${extensionDir}`);
}

if (cdpEndpoint) {
  browser = await chromium.connectOverCDP(cdpEndpoint, { timeout: 30000 });
  ctx = browser.contexts()[0];
  if (!ctx) await fail('no browser context found');
} else {
  ctx = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    args: [
      `--disable-extensions-except=${extensionDir}`,
      `--load-extension=${extensionDir}`,
      '--no-first-run',
      '--no-default-browser-check',
    ],
  });
}

const extensionId = await detectExtensionId(ctx);
if (!extensionId) {
  await fail('extension id not detected. Set E2E_EXTENSION_ID when attaching over CDP.');
}
console.log(`[verify-x-thread] extension id=${extensionId}`);

if (!skipExtensionReload && cdpEndpoint) {
  const reloadPage = await openExtensionPage('popup.html');
  await reloadPage.evaluate(() => chrome.runtime.reload()).catch(() => {});
  await reloadPage.close().catch(() => {});
  await sleep(2500);
  console.log('[verify-x-thread] extension reloaded');
} else if (cdpEndpoint) {
  console.log('[verify-x-thread] extension reload skipped');
} else {
  console.log('[verify-x-thread] fresh launch; extension reload not needed');
}

if (isolateXTabs) {
  for (const page of ctx.pages()) {
    if (/^https:\/\/(x|twitter)\.com\//.test(page.url())) {
      await page.close().catch(() => {});
    }
  }
  console.log('[verify-x-thread] existing X tabs closed for isolation');
}

const popup = await openExtensionPage('popup.html');
await popup.waitForTimeout(1000);

const version = await popup.evaluate(() => chrome.runtime.getManifest().version);
console.log(`[verify-x-thread] version=${version}`);

await popup.evaluate(async () => {
  const stored = (await chrome.storage.sync.get('settings')).settings ?? {};
  await chrome.storage.sync.set({ settings: { ...stored, autoPost: false } });
});
console.log('[verify-x-thread] autoPost=false');

let xHome = ctx.pages().find((page) => /^https:\/\/(x|twitter)\.com\//.test(page.url()));
if (!xHome) xHome = await ctx.newPage();
await xHome.goto('https://x.com/home', { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
await xHome.bringToFront();
await xHome.waitForTimeout(4000);

const homeState = await xHome.evaluate(() => ({
  url: location.href,
  hasTextarea: !!document.querySelector('[data-testid="tweetTextarea_0"]'),
  hasLoginLink: !!document.querySelector('a[href="/login"], a[href*="/i/flow/login"]'),
  title: document.title,
}));
console.log('[verify-x-thread] home state:', JSON.stringify(homeState));
if (!homeState.hasTextarea) {
  await fail('X home composer was not found. The verification profile is probably signed out.', homeState);
}

const text = [
  `Tutti X existing-home thread check ${includeImage ? 'with image' : 'text only'} ${new Date().toISOString()}`,
  `part 1 ${'alpha '.repeat(24)}`,
  `part 2 ${'bravo '.repeat(24)}`,
].join('\n');
const png = includeImage ? makePng(128, 128) : null;
const image = png
  ? {
      name: `tutti-x-thread-${Date.now()}.png`,
      type: 'image/png',
      data: png.toString('base64'),
      bytes: png.byteLength,
    }
  : null;

const postResp = await popup.evaluate(async ({ text, image }) => {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      { type: 'POST_REQUEST', text, platforms: ['x'], images: image ? [image] : undefined },
      (resp) => resolve(resp ?? { error: chrome.runtime.lastError?.message ?? 'no response' }),
    );
  });
}, { text, image });
console.log('[verify-x-thread] POST_REQUEST response:', JSON.stringify(postResp));

const xResult = postResp?.results?.find?.((r) => r.platform === 'x');
if (!xResult?.success) {
  await fail('POST_REQUEST did not report X success', postResp);
}

await xHome.waitForTimeout(3000);
const xPages = ctx.pages().filter((page) => /^https:\/\/(x|twitter)\.com\//.test(page.url()));
const xPage = xPages.find((page) => page.url().startsWith('https://x.com/compose/post'))
  ?? xPages.find((page) => page.url().includes('/compose/post'))
  ?? xHome;
await xPage.bringToFront();
await xPage.waitForTimeout(1000);

if (includeImage) {
  for (let i = 0; i < 20; i += 1) {
    const previewCount = await xPage.evaluate(() => {
      const dialog = Array.from(document.querySelectorAll('[role="dialog"]'))
        .find((el) => el.querySelector('[data-testid^="tweetTextarea_"]'));
      if (!dialog) return 0;
      return dialog.querySelectorAll('[data-testid="attachments"], [data-testid="attachments"] img, img[src^="blob:"]').length;
    });
    if (previewCount > 0) break;
    await xPage.waitForTimeout(1000);
  }
}

const composeState = await xPage.evaluate(() => {
  const dialog = Array.from(document.querySelectorAll('[role="dialog"]'))
    .find((el) => el.querySelector('[data-testid^="tweetTextarea_"]'));
  const dialogTextareas = Array.from(document.querySelectorAll(
    '[role="dialog"] [data-testid^="tweetTextarea_"][contenteditable="true"], [role="dialog"] [data-testid^="tweetTextarea_"][role="textbox"]',
  ));
  const allTextareas = Array.from(document.querySelectorAll('[data-testid^="tweetTextarea_"]'));
  const dialogButtons = Array.from(document.querySelectorAll('[role="dialog"] [data-testid="tweetButton"], [role="dialog"] [data-testid="tweetButtonInline"]'));
  return {
    url: location.href,
    dialogCount: document.querySelectorAll('[role="dialog"]').length,
    dialogTextareaCount: dialogTextareas.length,
    allTextareaCount: allTextareas.length,
    texts: dialogTextareas.map((el) => (el.textContent ?? '').slice(0, 300)),
    dialogButtons: dialogButtons.map((el) => ({
      testid: el.getAttribute('data-testid'),
      text: (el.textContent ?? '').replace(/\s+/g, ' ').trim(),
      disabled: el.getAttribute('aria-disabled') === 'true' || el.disabled === true,
    })),
    imagePreviewCount: dialog
      ? dialog.querySelectorAll('[data-testid="attachments"], [data-testid="attachments"] img, img[src^="blob:"]').length
      : 0,
    hasHomeInlinePostButton: !!document.querySelector('main [data-testid="tweetButtonInline"]'),
  };
});
console.log('[verify-x-thread] compose state:', JSON.stringify(composeState, null, 2));

if (!composeState.url.includes('/compose/post')) {
  await fail('X tab did not end on /compose/post', composeState);
}
if (composeState.dialogTextareaCount < 2) {
  await fail('X compose dialog does not contain at least two thread textareas', composeState);
}
if (!composeState.texts.some((s) => s.includes('alpha')) || !composeState.texts.some((s) => s.includes('bravo'))) {
  await fail('X thread textareas do not contain both chunks', composeState);
}
if (includeImage && composeState.imagePreviewCount < 1) {
  await fail('X compose dialog does not contain an attached image preview', composeState);
}

console.log('[verify-x-thread] PASS');

await popup.close().catch(() => {});
if (!cdpEndpoint) await ctx.close();
if (browser) await browser.close().catch(() => {});
