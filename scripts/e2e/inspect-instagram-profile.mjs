import { chromium } from 'playwright';

const ctx = await chromium.launchPersistentContext(
  process.env.E2E_USER_DATA_DIR ?? 'C:/Users/komm64/.tutti-e2e-chrome',
  { headless: false, args: ['--no-first-run'] },
);
const page = await ctx.newPage();
await page.goto('https://www.instagram.com/ren.fujimoto.89/', { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
await page.waitForTimeout(8000);
console.log(JSON.stringify(await page.evaluate(() => ({
  url: location.href,
  title: document.title,
  bodyExcerpt: (document.body?.innerText ?? '').slice(0, 2000),
  links: [...document.querySelectorAll('a[href]')]
    .map((anchor) => anchor.href)
    .filter((href) => /\/p\/|\/reel\//.test(href))
    .slice(0, 40),
})), null, 2));
await ctx.close();
