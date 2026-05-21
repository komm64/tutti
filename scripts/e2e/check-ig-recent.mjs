import puppeteer from 'puppeteer-core';
const browser = await puppeteer.connect({
  browserURL: 'http://localhost:9222',
  defaultViewport: null,
  protocolTimeout: 60000,
});
const pages = await browser.pages();
let igPage = pages.find((p) => /instagram\.com/.test(p.url()));
if (!igPage) {
  igPage = await browser.newPage();
}

// own profile に navigate
const handle = process.env.IG_HANDLE || 'ren.fujimoto.89';
await igPage.goto(`https://www.instagram.com/${handle}/`, { waitUntil: 'domcontentloaded', timeout: 30000 });
await new Promise((r) => setTimeout(r, 6000));

// 最新 post の image をクリックして詳細ダイアログを開く
const firstPostLink = await igPage.evaluate(() => {
  const a = document.querySelector('a[href*="/p/"]');
  return a?.getAttribute('href');
});
console.log('first post link:', firstPostLink);

if (!firstPostLink) {
  console.log('no posts found');
  browser.disconnect();
  process.exit(1);
}

await igPage.goto(`https://www.instagram.com${firstPostLink}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
await new Promise((r) => setTimeout(r, 5000));

const detail = await igPage.evaluate(() => {
  // caption: article 内の <h1> 周辺 / [data-testid] / meta description
  const meta = document.querySelector('meta[property="og:description"]')?.getAttribute('content') ?? '';
  const altText = document.querySelector('img[alt]')?.getAttribute('alt') ?? '';
  return { url: location.href, meta: meta.slice(0, 300), altText: altText.slice(0, 200), title: document.title };
});
console.log(JSON.stringify(detail, null, 2));
browser.disconnect();
