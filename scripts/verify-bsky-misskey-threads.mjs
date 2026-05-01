import puppeteer from 'puppeteer-core';
const browser = await puppeteer.connect({ browserURL: 'http://localhost:9222', protocolTimeout: 90000 });

async function check(label, url, needle) {
  console.log(`\n=== ${label} ===`);
  for (const p of await browser.pages()) {
    if (p.url().includes(new URL(url).hostname)) await p.close();
  }
  const page = await browser.newPage();
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await new Promise(r => setTimeout(r, 8000));
    await page.evaluate(() => window.scrollTo(0, 400));
    await new Promise(r => setTimeout(r, 2000));
  } catch (e) { console.log('navigate err:', e.message); }

  const state = await page.evaluate((needle) => {
    const articles = Array.from(document.querySelectorAll('article'));
    const matches = articles.filter(a => a.innerText.includes(needle));
    return {
      totalArticles: articles.length,
      matches: matches.length,
      first3: articles.slice(0, 3).map(a => a.innerText.slice(0, 200)),
    };
  }, needle).catch(() => null);
  console.log(JSON.stringify(state, null, 2));
  await page.screenshot({ path: `scripts/verify2-${label.toLowerCase()}.png` });
  await page.close();
}

await check('Bluesky', 'https://bsky.app/profile/ren-fujimoto89.bsky.social', 'Tutti自動投稿');
await check('Threads', 'https://www.threads.com/@ren.fujimoto.89', 'Tutti自動投稿');
await check('Misskey', 'https://misskey.io/@ren_fujimoto', 'Tutti自動投稿');

await browser.disconnect();
