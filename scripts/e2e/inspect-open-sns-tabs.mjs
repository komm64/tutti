import { chromium } from 'playwright';

const hostPattern = new RegExp(process.argv[2] ?? 'pixiv\\.net|deviantart\\.com|instagram\\.com');
const ctx = await chromium.launchPersistentContext(
  process.env.E2E_USER_DATA_DIR ?? 'C:/Users/komm64/.tutti-e2e-chrome',
  { headless: false, args: ['--no-first-run'] },
);
await new Promise((resolve) => setTimeout(resolve, 3000));
for (const page of ctx.pages().filter((candidate) => hostPattern.test(candidate.url()))) {
  const state = await page.evaluate(() => ({
    url: location.href,
    title: document.title,
    bodyExcerpt: (document.body?.innerText ?? '').slice(0, 2500),
    links: [...document.querySelectorAll('a[href]')]
      .map((a) => ({ href: a.href, text: a.textContent?.trim().slice(0, 120) }))
      .filter((a) => /artworks|users|deviation|\/p\/|\/reel\//.test(a.href))
      .slice(0, 80),
    errors: [...document.querySelectorAll('[role="alert"], [class*="error" i], [class*="invalid" i]')]
      .map((e) => e.textContent?.trim().slice(0, 200))
      .filter(Boolean)
      .slice(0, 30),
  })).catch((error) => ({ error: String(error) }));
  console.log(JSON.stringify(state, null, 2));
}
await ctx.close();
