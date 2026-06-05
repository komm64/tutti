import { chromium } from 'playwright';

const browser = await chromium.connectOverCDP(process.env.E2E_CDP ?? 'http://localhost:9222', { timeout: 120_000 });
const ctx = browser.contexts()[0];
if (!ctx) throw new Error('CDP context not found');
const targetUrl = process.argv[2];
const page = targetUrl
  ? await ctx.newPage()
  : ctx.pages().find((candidate) => /^https:\/\/x\.com\//.test(candidate.url()));
if (!page) throw new Error('X tab not found');

if (targetUrl) await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 }).catch(() => {});
await page.bringToFront();
await page.waitForTimeout(targetUrl ? 12_000 : 3000);
console.log(JSON.stringify(await page.evaluate(() => ({
  url: location.href,
  title: document.title,
  excerpt: (document.body?.innerText ?? '').slice(0, 1600),
  readyState: document.readyState,
  buttons: [...document.querySelectorAll('button, [role="button"]')]
    .map((button) => ({
      text: button.textContent?.trim().slice(0, 120),
      aria: button.getAttribute('aria-label'),
      testid: button.getAttribute('data-testid'),
    }))
    .filter((button) => button.text || button.aria || button.testid)
    .slice(0, 80),
  editors: [...document.querySelectorAll('textarea, [contenteditable="true"]')]
    .map((editor) => ({
      tag: editor.tagName,
      aria: editor.getAttribute('aria-label'),
      role: editor.getAttribute('role'),
      contenteditable: editor.getAttribute('contenteditable'),
      testid: editor.getAttribute('data-testid'),
      matchesTuttiSelector: editor.matches('[data-testid="tweetTextarea_0"][role="textbox"], [data-testid="tweetTextarea_0"][contenteditable="true"]'),
    })),
  articles: [...document.querySelectorAll('article')].slice(0, 5).map((article) => ({
    text: (article.textContent ?? '').trim().slice(0, 500),
    urls: [...article.querySelectorAll('a[href*="/status/"]')]
      .map((link) => link.href)
      .filter((url, index, urls) => urls.indexOf(url) === index)
      .slice(0, 5),
  })),
  accountMenuHtml: document.querySelector('[data-testid="SideNav_AccountSwitcher_Button"]')?.outerHTML.slice(0, 1800),
  selfLinks: [...document.querySelectorAll('a[href^="/"]')]
    .map((link) => link.getAttribute('href'))
    .filter((href, index, hrefs) => href && /^\/[^/?#]+$/.test(href) && hrefs.indexOf(href) === index)
    .slice(0, 80),
  tuttiLatestPost: localStorage.getItem('tutti:x-latest-post'),
})), null, 2));

const path = 'C:/Users/komm64/x-home-state.png';
await page.screenshot({ path, fullPage: false });
console.log(`[capture] ${path}`);
if (targetUrl) await page.close();
await browser.close();
