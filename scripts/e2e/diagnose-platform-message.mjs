import { chromium } from 'playwright';

const platform = process.argv[2];
const extensionId = process.env.E2E_EXTENSION_ID ?? 'klmldcimakkjhlbckpkobjdbpnldkikn';
if (!platform) {
  console.error('Usage: node scripts/e2e/diagnose-platform-message.mjs <platform>');
  process.exit(2);
}

const browser = await chromium.connectOverCDP(process.env.E2E_CDP ?? 'http://localhost:9222', { timeout: 120_000 });
const ctx = browser.contexts()[0];
if (!ctx) throw new Error('CDP context not found');
const page = ctx.pages().find((candidate) =>
  candidate.url().startsWith(`chrome-extension://${extensionId}/`)) ?? await ctx.newPage();
if (!page.url().startsWith(`chrome-extension://${extensionId}/`)) {
  await page.goto(`chrome-extension://${extensionId}/popup.html`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
}

const result = await page.evaluate(async (name) => {
  const tabs = await chrome.tabs.query({});
  const tab = tabs.find((candidate) => candidate.url?.startsWith('https://x.com/'));
  if (!tab?.id) throw new Error('X tab not found');
  return await chrome.tabs.sendMessage(tab.id, { type: 'DIAGNOSE_PLATFORM', platform: name });
}, platform);
console.log(JSON.stringify(result, null, 2));
await browser.close();
