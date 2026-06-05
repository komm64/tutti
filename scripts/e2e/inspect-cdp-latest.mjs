import { chromium } from 'playwright';

const needle = process.argv[2];
if (!needle) {
  console.error('Usage: node scripts/e2e/inspect-cdp-latest.mjs <text-prefix>');
  process.exit(2);
}

const browser = await chromium.connectOverCDP(process.env.E2E_CDP ?? 'http://localhost:9222', { timeout: 120_000 });
const ctx = browser.contexts()[0];
if (!ctx) throw new Error('CDP context not found');

const targets = [
  ['x', 'https://x.com/ren_fujimoto'],
  ['bluesky', 'https://bsky.app/profile/ren-fujimoto89.bsky.social'],
  ['threads', 'https://www.threads.com/@ren.fujimoto.89'],
  ['tumblr', 'https://www.tumblr.com/ren-fujimoto'],
  ['misskey', 'https://misskey.io/@ren_fujimoto'],
];

for (const [platform, url] of targets) {
  const page = await ctx.newPage();
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 }).catch(() => {});
    await page.waitForTimeout(5_000);
    const state = await page.evaluate(({ platformName, text }) => {
      const body = document.body?.innerText ?? '';
      const links = [...document.querySelectorAll('a[href]')]
        .map((anchor) => ({
          href: anchor.href,
          text: (anchor.textContent ?? '').trim().slice(0, 240),
          parentText: (anchor.parentElement?.innerText ?? '').trim().slice(0, 500),
        }))
        .filter(({ href }) => {
          if (platformName === 'x') return /\/status\/\d+/.test(href);
          if (platformName === 'bluesky') return /\/post\/[\w-]+/.test(href);
          if (platformName === 'threads') return /\/post\/[\w-]+/.test(href);
          if (platformName === 'tumblr') return /\/\d{5,}(?:\/|$)/.test(href);
          return /\/notes\/[\w-]+/.test(href);
        });
      return {
        url: location.href,
        title: document.title,
        bodyHasNeedle: body.includes(text),
        matchingLinks: links.filter(({ text: linkText, parentText }) =>
          linkText.includes(text) || parentText.includes(text)).slice(0, 12),
        candidateLinks: links.slice(0, 12),
      };
    }, { platformName: platform, text: needle });
    console.log(`\n=== ${platform} ===`);
    console.log(JSON.stringify(state, null, 2));
  } finally {
    await page.close().catch(() => {});
  }
}

await browser.close();
