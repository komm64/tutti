import { chromium } from 'playwright';

const browser = process.env.E2E_CDP ? await chromium.connectOverCDP(process.env.E2E_CDP) : null;
const ctx = browser?.contexts()[0] ?? await chromium.launchPersistentContext(
  process.env.E2E_USER_DATA_DIR ?? 'C:/Users/komm64/.tutti-e2e-chrome',
  { headless: false, args: ['--no-first-run'] },
);
const page = await ctx.newPage();
await page.goto('https://www.pixiv.net/en/users/125846781', { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
await page.waitForTimeout(6000);
console.log(JSON.stringify(await page.evaluate(() => ({
  url: location.href,
  title: document.title,
  bodyExcerpt: (document.body?.innerText ?? '').slice(0, 2500),
  links: [...document.querySelectorAll('a[href*="/artworks/"]')]
    .map((anchor) => ({ href: anchor.href, text: anchor.textContent?.trim().slice(0, 160) }))
    .slice(0, 50),
})), null, 2));
if (browser) await browser.close();
else await ctx.close();
