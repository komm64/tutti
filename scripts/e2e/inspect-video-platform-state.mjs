import { chromium } from 'playwright';

const ctx = await chromium.launchPersistentContext(
  process.env.E2E_USER_DATA_DIR ?? 'C:/Users/komm64/.tutti-e2e-chrome',
  { headless: false, args: ['--no-first-run'] },
);
const page = await ctx.newPage();
for (const url of ['https://www.tiktok.com/tiktokstudio/content', 'https://studio.youtube.com/', 'https://studio.youtube.com/channel/UCxDdnILOoRDaC0IWjioL_8g/videos']) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(6000);
  console.log(JSON.stringify(await page.evaluate(() => ({
    url: location.href,
    title: document.title,
    bodyExcerpt: (document.body?.innerText ?? '').slice(0, 3000),
    links: [...document.querySelectorAll('a[href]')]
      .map((anchor) => ({ href: anchor.href, text: anchor.textContent?.trim().slice(0, 160) }))
      .filter((link) => /\/video\/|youtu\.be|youtube\.com\/watch/.test(link.href))
      .slice(0, 50),
  })), null, 2));
}
await ctx.close();
