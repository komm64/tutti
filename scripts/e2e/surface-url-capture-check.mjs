/**
 * Surface real-browser URL capture check.
 *
 * Requirements:
 *   - A Chromium/Chrome instance on Surface is running with Tutti loaded.
 *   - CDP is reachable from this machine, usually through an SSH tunnel.
 *   - The target SNS accounts are logged in on the Surface browser profile.
 *
 * Usage:
 *   E2E_CDP=http://127.0.0.1:9223 \
 *   IMAGE_PATH=scripts/e2e/fixtures/test-image.png \
 *   PLATFORMS=threads,tumblr \
 *   node scripts/e2e/surface-url-capture-check.mjs
 *
 * Set AUTOPOST=false for preview-only checks. Preview checks intentionally
 * fail URL assertions because no post URL exists.
 */

import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';

const cdp = process.env.E2E_CDP ?? 'http://127.0.0.1:9223';
const fixturePath = resolve(process.env.IMAGE_PATH ?? 'scripts/e2e/fixtures/test-image.png');
const platforms = (process.env.PLATFORMS ?? 'threads,tumblr')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);
const autoPost = process.env.AUTOPOST === 'false' ? false : true;
const text = process.env.POST_TEXT ?? '';

const browser = await chromium.connectOverCDP(cdp, { timeout: 120_000 });
const ctx = browser.contexts()[0];
if (!ctx) throw new Error('no browser context');

async function detectExtensionId() {
  for (const sw of ctx.serviceWorkers()) {
    const m = sw.url().match(/^chrome-extension:\/\/([a-z]+)\//);
    if (m) return m[1];
  }
  const page = await ctx.newPage();
  await page.goto('chrome://extensions/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1000);
  const id = await page.evaluate(async () => {
    const getInfo = () => new Promise((resolveInfo) => {
      chrome.developerPrivate.getExtensionsInfo({ includeDisabled: true, includeTerminated: true }, resolveInfo);
    });
    const extensions = await getInfo();
    return extensions.find((ext) => ext.name?.includes('Tutti'))?.id;
  });
  await page.close();
  if (!id) throw new Error('Tutti extension id not found');
  return id;
}

async function wakeServiceWorker(extensionId) {
  let sw = ctx.serviceWorkers().find((worker) => worker.url().includes(`chrome-extension://${extensionId}/`));
  if (sw) return sw;
  const page = await ctx.newPage();
  await page.goto(`chrome-extension://${extensionId}/popup.html`, { waitUntil: 'domcontentloaded' });
  for (let i = 0; i < 50; i += 1) {
    sw = ctx.serviceWorkers().find((worker) => worker.url().includes(`chrome-extension://${extensionId}/`));
    if (sw) break;
    await page.waitForTimeout(100);
  }
  await page.close();
  if (!sw) throw new Error('Tutti service worker not found');
  return sw;
}

async function closeTargetTabs() {
  const domains = platforms
    .map((platform) => {
      if (platform === 'threads') return 'threads\\.(?:com|net)';
      if (platform === 'tumblr') return 'tumblr\\.com';
      return platform.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    })
    .join('|');
  if (!domains) return;
  const re = new RegExp(domains);
  for (const page of ctx.pages()) {
    if (re.test(page.url())) await page.close().catch(() => {});
  }
}

async function inspectPostUrl(url, platform) {
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForTimeout(5000);
  const info = await page.evaluate((platformName) => {
    const visibleMedia = Array.from(document.querySelectorAll('img, video'))
      .map((el) => {
        const rect = el.getBoundingClientRect();
        const src = el instanceof HTMLImageElement ? el.currentSrc || el.src : el.currentSrc || el.src;
        return {
          tag: el.tagName,
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          src: src?.slice(0, 120),
        };
      })
      .filter((m) => m.width >= 80 && m.height >= 80);
    return {
      finalUrl: location.href,
      title: document.title,
      bodySnippet: document.body.innerText.replace(/\s+/g, ' ').trim().slice(0, 300),
      visibleMediaCount: visibleMedia.length,
      visibleMedia,
      looksLikePost:
        platformName === 'threads'
          ? /\/@[^/]+\/post\/[\w-]+/.test(location.href)
          : /tumblr\.com\/(?:[^/]+\/\d+|blog\/[^/]+\/\d+)/.test(location.href),
    };
  }, platform);
  await page.close();
  return info;
}

await closeTargetTabs();

const extensionId = await detectExtensionId();
await wakeServiceWorker(extensionId);

const imageBytes = await readFile(fixturePath);
const image = {
  name: basename(fixturePath),
  type: 'image/png',
  data: imageBytes.toString('base64'),
  bytes: imageBytes.length,
};

const startedAt = new Date().toISOString();
console.log(`[surface-urlcapture] extension=${extensionId} started=${startedAt}`);
console.log(`[surface-urlcapture] posting image-only to ${platforms.join(', ')} autoPost=${autoPost}`);

const popup = await ctx.newPage();
await popup.goto(`chrome-extension://${extensionId}/popup.html`, { waitUntil: 'domcontentloaded' });
await popup.waitForTimeout(1000);

const postResponse = await popup.evaluate(
  async ({ image: imagePayload, platforms: targetPlatforms, autoPost: shouldAutoPost, text: postText }) => {
    return await new Promise((resolveResponse) => {
      chrome.runtime.sendMessage({
        type: 'POST_REQUEST',
        text: postText,
        platforms: targetPlatforms,
        images: [imagePayload],
        autoPost: shouldAutoPost,
      }, (response) => {
        resolveResponse({
          response,
          lastError: chrome.runtime.lastError?.message,
        });
      });
    });
  },
  { image, platforms, autoPost, text },
);
await popup.close().catch(() => {});

console.log('[surface-urlcapture] raw result');
console.log(JSON.stringify(postResponse, null, 2));

const results = postResponse?.response?.results ?? [];
const inspections = {};
for (const result of results) {
  if (result?.url) {
    inspections[result.platform] = await inspectPostUrl(result.url, result.platform);
  }
}

console.log('[surface-urlcapture] inspections');
console.log(JSON.stringify(inspections, null, 2));

const failures = [];
if (postResponse?.lastError) failures.push(`runtime lastError: ${postResponse.lastError}`);
for (const platform of platforms) {
  const result = results.find((r) => r.platform === platform);
  if (!result?.success) failures.push(`${platform}: success=false (${result?.error ?? 'missing result'})`);
  if (!result?.url) failures.push(`${platform}: URL missing`);
  const info = result?.url ? inspections[platform] : undefined;
  if (info && !info.looksLikePost) failures.push(`${platform}: URL does not look like a post (${info.finalUrl})`);
  if (info && info.visibleMediaCount < 1) failures.push(`${platform}: no visible media on captured URL`);
}

if (failures.length > 0) {
  console.error('[surface-urlcapture] FAIL');
  for (const failure of failures) console.error(`  - ${failure}`);
  await browser.close();
  process.exit(1);
}

console.log('[surface-urlcapture] PASS');
await browser.close();
