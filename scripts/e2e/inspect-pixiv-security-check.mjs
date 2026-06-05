import { chromium } from 'playwright';

const browser = await chromium.connectOverCDP(process.env.E2E_CDP ?? 'http://localhost:9222');
const ctx = browser.contexts()[0];
for (const page of ctx.pages().filter((candidate) => /pixiv\.net/.test(candidate.url()))) {
  const state = await page.evaluate(() => ({
    url: location.href,
    title: document.title,
    bodyExcerpt: (document.body?.innerText ?? '').slice(0, 4000),
    dialogs: [...document.querySelectorAll('[role="dialog"], [role="alertdialog"]')]
      .map((dialog) => dialog.textContent?.trim().slice(0, 1500)),
    buttons: [...document.querySelectorAll('button, [role="button"]')]
      .map((button) => ({
        text: button.textContent?.trim().slice(0, 200),
        aria: button.getAttribute('aria-label'),
        disabled: button.getAttribute('aria-disabled') === 'true' || button.disabled === true,
      }))
      .filter((button) => button.text || button.aria)
      .slice(-80),
    iframes: [...document.querySelectorAll('iframe')].map((frame) => ({
      src: frame.getAttribute('src'),
      title: frame.getAttribute('title'),
    })),
  })).catch((error) => ({ error: String(error) }));
  console.log(JSON.stringify(state, null, 2));
}
await browser.close();
