import { chromium } from 'playwright';

const platform = process.argv[2];
if (!['threads', 'bluesky', 'misskey'].includes(platform)) {
  console.error('Usage: node scripts/e2e/probe-cdp-submit.mjs <threads|bluesky|misskey>');
  process.exit(2);
}

const browser = await chromium.connectOverCDP(process.env.E2E_CDP ?? 'http://localhost:9222', {
  timeout: 120_000,
});
const ctx = browser.contexts()[0];
if (!ctx) throw new Error('CDP context not found');
const page = ctx.pages().find((candidate) =>
  platform === 'threads'
    ? /threads\.com\/intent\/post/.test(candidate.url())
    : platform === 'bluesky'
      ? /bsky\.app\//.test(candidate.url())
      : /misskey\.io\/share/.test(candidate.url()));
if (!page) throw new Error(`${platform} compose page not found`);

const before = await page.evaluate((platformName) => {
  const button = platformName === 'threads'
    ? [...document.querySelectorAll('[role="dialog"] [role="button"], [role="dialog"] button')]
      .find((el) => (el.textContent ?? '').trim() === 'Post')
    : platformName === 'bluesky'
      ? document.querySelector('[data-testid="composerPublishBtn"]')
      : [...document.querySelectorAll('button')]
        .find((el) => (el.textContent ?? '').trim() === 'ノート');
  return {
    url: location.href,
    dialogCount: document.querySelectorAll('[role="dialog"], [role="alertdialog"]').length,
    button: button ? {
      text: (button.textContent ?? '').trim(),
      html: button.outerHTML.slice(0, 1200),
    } : null,
  };
}, platform);
console.log('before:', JSON.stringify(before, null, 2));

if (!before.button) throw new Error('submit button not found');
await page.evaluate((platformName) => {
  const button = platformName === 'threads'
    ? [...document.querySelectorAll('[role="dialog"] [role="button"], [role="dialog"] button')]
      .find((el) => (el.textContent ?? '').trim() === 'Post')
    : platformName === 'bluesky'
      ? document.querySelector('[data-testid="composerPublishBtn"]')
      : [...document.querySelectorAll('button')]
        .find((el) => (el.textContent ?? '').trim() === 'ノート');
  button?.click();
}, platform);
await page.waitForTimeout(5_000);

const after = await page.evaluate(() => ({
  url: location.href,
  dialogCount: document.querySelectorAll('[role="dialog"], [role="alertdialog"]').length,
  bodyExcerpt: (document.body?.innerText ?? '').slice(-900),
}));
console.log('after:', JSON.stringify(after, null, 2));
await browser.close();
