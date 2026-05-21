import puppeteer from 'puppeteer-core';
const browser = await puppeteer.connect({
  browserURL: 'http://localhost:9222',
  defaultViewport: null,
  protocolTimeout: 60000,
});
const pages = await browser.pages();
const xPage = pages.find((p) => /x\.com|twitter\.com/.test(p.url()));
if (!xPage) { console.log('no X tab'); browser.disconnect(); process.exit(1); }
console.log('X tab:', xPage.url());

// open profile to check own posts
const profileUrl = process.env.X_PROFILE_URL || 'https://x.com/home';
await xPage.goto(profileUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
await new Promise((r) => setTimeout(r, 5000));
const posts = await xPage.evaluate(() => {
  // 最新の article (= post / tweet) の text を順番に取る
  const articles = Array.from(document.querySelectorAll('article'));
  return articles.slice(0, 5).map((a) => {
    const text = (a.querySelector('[data-testid="tweetText"]')?.textContent ?? '').slice(0, 200);
    const time = a.querySelector('time')?.getAttribute('datetime');
    return { text, time };
  });
});
console.log(JSON.stringify(posts, null, 2));
browser.disconnect();
