import puppeteer from 'puppeteer-core';
const browser = await puppeteer.connect({
  browserURL: 'http://localhost:9222',
  defaultViewport: null,
  protocolTimeout: 60000,
});
const pages = await browser.pages();
let bskyPage = pages.find((p) => /bsky\.app/.test(p.url()));
if (!bskyPage) {
  bskyPage = await browser.newPage();
  await bskyPage.goto('https://bsky.app/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await new Promise((r) => setTimeout(r, 5000));
}

// own posts に navigate するため profile URL を組み立てる
// Bluesky session の handle を取る
const handle = await bskyPage.evaluate(() => {
  // localStorage の session JSON 探索
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    const v = localStorage.getItem(k);
    if (!v) continue;
    try {
      const parsed = JSON.parse(v);
      const find = (obj, depth = 0) => {
        if (depth > 5 || !obj || typeof obj !== 'object') return null;
        if (typeof obj.handle === 'string') return obj.handle;
        for (const v of Object.values(obj)) {
          const f = find(v, depth + 1);
          if (f) return f;
        }
        return null;
      };
      const h = find(parsed);
      if (h) return h;
    } catch {}
  }
  return null;
});
console.log('handle:', handle);

if (!handle) {
  console.log('cannot find handle, aborting');
  browser.disconnect();
  process.exit(1);
}

await bskyPage.goto(`https://bsky.app/profile/${handle}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
await new Promise((r) => setTimeout(r, 5000));

const posts = await bskyPage.evaluate(() => {
  // [data-testid="postText"] や [data-testid="feedItem"] の text を取る
  const items = Array.from(document.querySelectorAll('[data-testid*="feedItem-by-"], [data-testid*="postThreadItem"]')).slice(0, 6);
  if (items.length > 0) {
    return items.map((el) => {
      const text = el.querySelector('[data-testid="postText"]')?.textContent ?? el.textContent;
      return (text ?? '').slice(0, 200);
    });
  }
  // fallback: all postText
  return Array.from(document.querySelectorAll('[data-testid="postText"]')).slice(0, 6).map((el) => (el.textContent ?? '').slice(0, 200));
});
console.log(JSON.stringify(posts, null, 2));
browser.disconnect();
