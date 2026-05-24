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
const dump = await page.evaluate(async () => {
  const got = await chrome.storage.local.get('postHistory');
  return JSON.stringify(got['postHistory'], null, 2);
});
console.log(dump);
await ctx.close();
