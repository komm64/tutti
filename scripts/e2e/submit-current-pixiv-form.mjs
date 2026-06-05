import { chromium } from 'playwright';

const browser = await chromium.connectOverCDP(process.env.E2E_CDP ?? 'http://localhost:9222');
const ctx = browser.contexts()[0];
const page = ctx.pages().find((candidate) => /pixiv\.net\/illustration\/create/.test(candidate.url()));
if (!page) {
  console.error('Pixiv create page not found');
  process.exit(2);
}
const clicked = await page.evaluate(() => {
  const buttons = [...document.querySelectorAll('button')]
    .filter((button) => /^(Post|投稿)$/.test(button.textContent?.trim() ?? ''))
    .filter((button) => !button.disabled && button.getAttribute('aria-disabled') !== 'true')
    .filter((button) => !button.className.includes('gtm-work-post-button-in-header-click'));
  const target = buttons.at(-1);
  if (!target) return false;
  target.scrollIntoView({ block: 'center' });
  target.click();
  return true;
});
console.log(`clicked=${clicked}`);
await page.waitForTimeout(5000);
console.log(`url=${page.url()}`);
await browser.close();
