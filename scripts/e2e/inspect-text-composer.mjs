import { chromium } from 'playwright';

const platform = process.argv[2];
if (!platform) {
  console.error('Usage: node scripts/e2e/inspect-text-composer.mjs <threads|tumblr>');
  process.exit(2);
}

const ctx = await chromium.launchPersistentContext(
  process.env.E2E_USER_DATA_DIR ?? 'C:/Users/komm64/.tutti-e2e-chrome',
  { headless: false, args: ['--no-first-run'] },
);
const page = await ctx.newPage();
const url = platform === 'threads'
  ? 'https://www.threads.com/intent/post?text=tutti%20composer%20inspect'
  : 'https://www.tumblr.com/new/text';
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
await page.waitForTimeout(5000);
const state = await page.evaluate(() => ({
  url: location.href,
  bodyExcerpt: (document.body?.innerText ?? '').slice(0, 2500),
  links: [...document.querySelectorAll('a[href]')]
    .map((a) => ({ href: a.getAttribute('href'), text: a.textContent?.trim().slice(0, 120), aria: a.getAttribute('aria-label') }))
    .filter((a) => a.href?.startsWith('/@') || a.href?.includes('/post/'))
    .slice(0, 80),
  buttons: [...document.querySelectorAll('button, [role="button"]')]
    .map((b) => ({
      text: b.textContent?.trim().slice(0, 120),
      aria: b.getAttribute('aria-label'),
      testid: b.getAttribute('data-testid'),
      disabled: b.getAttribute('aria-disabled') === 'true' || b.disabled === true,
    }))
    .filter((b) => b.text || b.aria || b.testid)
    .slice(0, 120),
  editors: [...document.querySelectorAll('[contenteditable="true"], [contenteditable="plaintext-only"], textarea')]
    .map((e) => ({
      tag: e.tagName,
      text: e.textContent?.trim().slice(0, 300),
      aria: e.getAttribute('aria-label'),
      role: e.getAttribute('role'),
      testid: e.getAttribute('data-testid'),
      classes: e.className,
    }))
    .slice(0, 30),
}));
console.log(JSON.stringify(state, null, 2));
await ctx.close();
