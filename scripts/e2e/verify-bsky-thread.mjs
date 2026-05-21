import puppeteer from 'puppeteer-core';
const browser = await puppeteer.connect({
  browserURL: 'http://localhost:9222',
  defaultViewport: null,
  protocolTimeout: 60000,
});
const pages = await browser.pages();
const bskyPage = pages.find((p) => /bsky\.app/.test(p.url())) || await browser.newPage();
await bskyPage.bringToFront();

const handle = 'ren-fujimoto89.bsky.social';
const rkey = process.env.BSKY_RKEY || '3mmeufrgqdi2s';
const url = `https://bsky.app/profile/${handle}/post/${rkey}`;
console.log('opening:', url);
await bskyPage.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
await new Promise((r) => setTimeout(r, 6000));

const detail = await bskyPage.evaluate(() => {
  const bodyText = document.body.innerText.slice(0, 2000);
  return {
    url: location.href,
    bodyText,
    hasReplyContext: /replying to|の返信|reply to/i.test(bodyText),
    articleCount: document.querySelectorAll('article').length,
  };
});
console.log(JSON.stringify(detail, null, 2));

await bskyPage.screenshot({ path: 'C:/Users/komm64/Projects/tutti/scripts/e2e/bsky-thread-shot.png', fullPage: true });
browser.disconnect();
