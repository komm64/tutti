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
let worker;
for (let i = 0; i < 50; i += 1) {
  worker = ctx.serviceWorkers()[0];
  if (worker) break;
  await new Promise((resolve) => setTimeout(resolve, 200));
}
await worker.evaluate(() => chrome.runtime.reload());
await new Promise((resolve) => setTimeout(resolve, 1500));
worker = ctx.serviceWorkers()[0];
const extId = new URL(worker.url()).host;
const xTab = await ctx.newPage();
await xTab.goto('https://x.com/home', { waitUntil: 'domcontentloaded', timeout: 30000 });
await xTab.waitForTimeout(3000);
const popup = await ctx.newPage();
await popup.goto(`chrome-extension://${extId}/popup.html`);
await popup.evaluate(async () => {
  const settings = (await chrome.storage.sync.get('settings')).settings ?? {};
  await chrome.storage.sync.set({ settings: { ...settings, autoPost: false } });
});
const text = 'あ'.repeat(141);
const response = await popup.evaluate(async (body) => chrome.runtime.sendMessage({
  type: 'POST_REQUEST',
  text: body,
  platforms: ['x'],
  images: [],
}), text);
console.log('response:', JSON.stringify(response));
const state = await xTab.evaluate(() => ({
  textareas: [...document.querySelectorAll('[data-testid^="tweetTextarea_"]')].map((el) => ({
    testid: el.getAttribute('data-testid'),
    text: el.textContent,
  })),
  buttons: [...document.querySelectorAll('button, [role="button"]')].map((el) => ({
    testid: el.getAttribute('data-testid'),
    text: el.textContent?.trim(),
    aria: el.getAttribute('aria-label'),
    disabled: el.getAttribute('aria-disabled') === 'true' || el.disabled,
  })).filter((button) => button.testid?.includes('tweet') || /post|tweet|ポスト|投稿/i.test(`${button.text} ${button.aria}`)),
}));
console.log(JSON.stringify(state, null, 2));
await ctx.close();
