import { chromium } from 'playwright';

const ctx = await chromium.launchPersistentContext(
  process.env.E2E_USER_DATA_DIR ?? 'C:/Users/komm64/.tutti-e2e-chrome',
  { headless: false, args: ['--no-first-run'] },
);
const page = await ctx.newPage();
await page.goto('https://www.tiktok.com/tiktokstudio/upload', { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
await page.waitForTimeout(6000);
console.log(JSON.stringify(await page.evaluate(() => ({
  url: location.href,
  title: document.title,
  bodyExcerpt: (document.body?.innerText ?? '').slice(0, 3000),
  inputs: [...document.querySelectorAll('input[type="file"]')].map((input) => ({
    accept: input.getAttribute('accept'),
    disabled: input.disabled,
  })),
  editors: [...document.querySelectorAll('[contenteditable="true"]')].map((editor) => ({
    classes: editor.className,
    role: editor.getAttribute('role'),
    aria: editor.getAttribute('aria-label'),
  })),
})), null, 2));
await ctx.close();
