import { chromium } from 'playwright';

const browser = await chromium.connectOverCDP(process.env.E2E_CDP ?? 'http://127.0.0.1:9222');
const page = browser.contexts()[0]?.pages().find((p) => /x\.com|twitter\.com/.test(p.url()));
if (!page) {
  console.log('no X page');
  await browser.close();
  process.exit(1);
}

const data = await page.evaluate(() => ({
  url: location.href,
  editors: [...document.querySelectorAll('[role="dialog"] [data-testid="tweetTextarea_0"]')]
    .map((el, i) => ({
      i,
      tag: el.tagName,
      role: el.getAttribute('role'),
      contenteditable: el.getAttribute('contenteditable'),
      text: el.textContent,
      html: el.outerHTML.slice(0, 1200),
    })),
  buttons: [...document.querySelectorAll('[role="dialog"] [data-testid="tweetButton"]')]
    .map((b) => ({
      text: b.textContent,
      disabled: b.disabled,
      ariaDisabled: b.getAttribute('aria-disabled'),
      html: b.outerHTML.slice(0, 500),
    })),
}));

console.log(JSON.stringify(data, null, 2));
await browser.close();
