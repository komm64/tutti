import puppeteer from 'puppeteer-core';
const browser = await puppeteer.connect({ browserURL: 'http://localhost:9222', protocolTimeout: 90000 });

async function check(label, url, needle) {
  console.log(`\n=== ${label} ===`);
  for (const p of await browser.pages()) {
    if (p.url().includes(new URL(url).hostname)) await p.close();
  }
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await new Promise(r => setTimeout(r, 8000));

  const state = await page.evaluate((needle) => {
    const articles = Array.from(document.querySelectorAll('article'));
    const matches = articles.filter(a => a.innerText.includes(needle));
    return {
      totalArticles: articles.length,
      matches: matches.length,
      matchTexts: matches.slice(0, 3).map(m => m.innerText.slice(0, 200)),
    };
  }, needle);
  console.log(JSON.stringify(state, null, 2));
  await page.screenshot({ path: `scripts/verify-${label.toLowerCase()}.png` });
  await page.close();
}

await check('X', 'https://x.com/ren_fujimoto', 'Tutti自動投稿テスト');
await check('Mastodon', 'https://mastodon.social/@ren_fujimoto', 'Tutti自動投稿テスト');
await check('Tumblr', 'https://www.tumblr.com/blog/ren-fujimoto', 'Tutti自動投稿テスト');

await browser.disconnect();
