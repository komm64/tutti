// Run empty POST_REQUEST, then dump __debug keys + postHistory.
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
const page = await ctx.newPage();
await page.goto(`chrome-extension://${extId}/options.html`);
await page.waitForTimeout(500);

// Wipe everything
await page.evaluate(async () => {
  await chrome.storage.local.clear();
});
console.log('storage cleared');

// Empty POST_REQUEST
const resp = await page.evaluate(async () => {
  return await new Promise((res) => {
    chrome.runtime.sendMessage(
      { type: 'POST_REQUEST', text: 'TRACE_MARKER', platforms: [] },
      (r) => res(r ?? { err: chrome.runtime.lastError?.message }),
    );
  });
});
console.log('POST_REQUEST response:', JSON.stringify(resp));

await new Promise((r) => setTimeout(r, 3000));

const all = await page.evaluate(async () => {
  const g = await chrome.storage.local.get(null);
  return JSON.stringify(g, null, 2);
});
console.log('=== ALL storage ===');
console.log(all);

await ctx.close();
