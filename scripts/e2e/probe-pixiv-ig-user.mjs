/**
 * Pixiv / Instagram の logged-in user 検出が常に null になる問題の DOM 調査。
 * 各 page で:
 * - <header> の有無 / class
 * - /users/<id> link の場所
 * - aria-label*=Profile の有無
 */
import puppeteer from 'puppeteer-core';

const browser = await puppeteer.connect({
  browserURL: 'http://localhost:9222',
  defaultViewport: null,
  protocolTimeout: 60000,
});

const pages = await browser.pages();

async function probe(host, label) {
  let page = pages.find((p) => new RegExp(host).test(p.url()));
  if (!page) {
    console.log(`[${label}] no tab open`);
    return;
  }
  await page.bringToFront();
  await new Promise((r) => setTimeout(r, 8000));
  const snap = await page.evaluate(() => {
    const header = document.querySelector('header');
    const altHeader = document.querySelector('[class*="header" i]');
    const allUserLinks = Array.from(document.querySelectorAll('a[href*="/users/"]'))
      .slice(0, 15).map((a) => ({
        href: a.getAttribute('href'),
        text: (a.textContent ?? '').trim().slice(0, 40),
        ariaLabel: a.getAttribute('aria-label')?.slice(0, 40),
        inHeader: !!a.closest('header'),
        inNav: !!a.closest('nav, [role="navigation"]'),
        hasImg: !!a.querySelector('img'),
        imgAlt: a.querySelector('img')?.getAttribute('alt')?.slice(0, 40),
      }));
    const profileLinks = Array.from(document.querySelectorAll('a[aria-label]'))
      .filter((a) => {
        const al = a.getAttribute('aria-label')?.toLowerCase() ?? '';
        return /profile|プロフィール|个人主页|self|me|yourself/.test(al);
      })
      .slice(0, 10).map((a) => ({
        href: a.getAttribute('href'),
        ariaLabel: a.getAttribute('aria-label'),
      }));
    const navProfile = Array.from(document.querySelectorAll('nav a[href^="/"], [role="navigation"] a[href^="/"]'))
      .slice(0, 20).map((a) => ({
        href: a.getAttribute('href'),
        ariaLabel: a.getAttribute('aria-label'),
        text: (a.textContent ?? '').trim().slice(0, 30),
      }));
    return {
      url: location.href,
      title: document.title,
      hasHeaderTag: !!header,
      hasAltHeader: !!altHeader,
      headerHtml: header ? header.outerHTML.slice(0, 500) : null,
      allUserLinks,
      profileLinks,
      navProfile,
    };
  });
  console.log(`\n=== ${label} ===`);
  console.log(JSON.stringify(snap, null, 2));
}

await probe('pixiv\\.net', 'Pixiv');
await probe('instagram\\.com', 'Instagram');

browser.disconnect();
