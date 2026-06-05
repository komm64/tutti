import { chromium } from 'playwright';

const [platform, needle] = process.argv.slice(2);
if (!platform || !needle) {
  console.error('Usage: node scripts/e2e/inspect-text-platform-latest.mjs <platform> <needle>');
  process.exit(2);
}

const ctx = await chromium.launchPersistentContext(
  process.env.E2E_USER_DATA_DIR ?? 'C:/Users/komm64/.tutti-e2e-chrome',
  { headless: false, args: ['--no-first-run'] },
);
const page = await ctx.newPage();

const urls = {
  threads: ['https://www.threads.com/', 'https://www.threads.com/@ren.fujimoto.89'],
  tumblr: ['https://www.tumblr.com/dashboard', 'https://www.tumblr.com/blog/ren-fujimoto'],
};

for (const url of urls[platform] ?? []) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(5000);
  const state = await page.evaluate((text) => {
    const links = [...document.querySelectorAll('a[href]')].map((a) => ({
      href: a.href,
      text: a.textContent?.trim().slice(0, 200) ?? '',
    }));
    const body = document.body?.innerText ?? '';
    const matchingLinks = links.filter((link) => link.text.includes(text) || /\/post\/|\/t\/|\/\d{5,}/.test(link.href));
    return {
      url: location.href,
      title: document.title,
      bodyHasNeedle: body.includes(text),
      bodyExcerpt: body.slice(0, 1200),
      matchingLinks: matchingLinks.slice(0, 40),
    };
  }, needle);
  console.log(JSON.stringify(state, null, 2));
}

await ctx.close();
