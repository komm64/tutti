import { chromium } from 'playwright';

const [needle, targetUrl] = process.argv.slice(2);
if (!needle) {
  console.error('Usage: node scripts/e2e/inspect-x-latest.mjs <text-prefix>');
  process.exit(2);
}

const ctx = await chromium.launchPersistentContext(
  process.env.E2E_USER_DATA_DIR ?? 'C:/Users/komm64/.tutti-e2e-chrome',
  { headless: false, args: ['--no-first-run'] },
);
const page = await ctx.newPage();
await page.goto(targetUrl || 'https://x.com/ren_fujimoto', { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForTimeout(6000);
const posts = await page.locator('article').evaluateAll((articles, prefix) => articles.slice(0, 8).map((article) => {
  const statusLink = [...article.querySelectorAll('a[href*="/status/"]')]
    .map((a) => a.href)
    .find((href) => /\/status\/\d+/.test(href));
  return {
    text: article.querySelector('[data-testid="tweetText"]')?.textContent ?? '',
    url: statusLink,
    matches: article.textContent?.includes(prefix) ?? false,
  };
}), needle);
console.log(JSON.stringify(posts, null, 2));
console.log(JSON.stringify(await page.evaluate(() => ({
  bodyHasFirst: document.body.innerText.includes('(1/2)'),
  bodyHasSecond: document.body.innerText.includes('(2/2)'),
  statusLinks: [...new Set([...document.querySelectorAll('a[href*="/status/"]')].map((a) => a.href))].slice(0, 20),
})), null, 2));
await ctx.close();
process.exit(posts.some((post) => post.matches) ? 0 : 1);
