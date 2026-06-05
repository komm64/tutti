import { chromium } from 'playwright';

const ctx = await chromium.launchPersistentContext(
  process.env.E2E_USER_DATA_DIR ?? 'C:/Users/komm64/.tutti-e2e-chrome',
  { headless: false, args: ['--no-first-run'] },
);
const page = await ctx.newPage();

for (const probe of [
  {
    platform: 'threads',
    home: 'https://www.threads.com/',
    profile: 'https://www.threads.com/@ren.fujimoto.89',
    needle: 'tutti real-post verify 2026-06-01T18:44:59Z',
  },
  {
    platform: 'tumblr',
    home: 'https://www.tumblr.com/dashboard',
    profile: 'https://www.tumblr.com/blog/ren-fujimoto',
    needle: 'tutti real-post tumblr tagged 2026-06-01T19:05:00Z #tutti',
  },
  {
    platform: 'instagram',
    home: 'https://www.instagram.com/',
    profile: 'https://www.instagram.com/ren.fujimoto.89/',
    needle: 'tutti real-post pass instagram 2026-06-01T20:15:00Z #tutti',
  },
]) {
  await page.goto(probe.home, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(2000);
  const result = await page.evaluate(async ({ profile, needle }) => {
    const response = await fetch(profile, { credentials: 'include' });
    const html = await response.text();
    const index = html.indexOf(needle);
    return {
      status: response.status,
      htmlLength: html.length,
      bodyHasNeedle: index >= 0,
      excerpt: index >= 0 ? html.slice(Math.max(0, index - 600), index + needle.length + 600) : '',
    };
  }, probe);
  console.log(`===== ${probe.platform} =====`);
  console.log(JSON.stringify(result, null, 2));
}

await ctx.close();
