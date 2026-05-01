import puppeteer from 'puppeteer-core';
const browser = await puppeteer.connect({ browserURL: 'http://localhost:9222', protocolTimeout: 60000 });
const page = (await browser.pages()).find(p => p.url() === 'https://x.com/ren_fujimoto');
if (!page) { console.log('no profile tab'); process.exit(1); }
// Scroll to actual post
await page.evaluate(() => window.scrollTo(0, 600));
await new Promise(r => setTimeout(r, 2000));

const post = await page.evaluate(() => {
  const article = document.querySelector('article');
  if (!article) return null;
  const tweetText = article.querySelector('[data-testid="tweetText"]')?.innerText;
  const imgs = Array.from(article.querySelectorAll('img')).map(i => i.src.slice(0, 80));
  return { fullText: article.innerText.slice(0, 400), tweetText, imgs };
});
console.log(JSON.stringify(post, null, 2));
await page.screenshot({ path: 'scripts/x-post-content.png', fullPage: false });
await browser.disconnect();
