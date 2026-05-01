import puppeteer from 'puppeteer-core';
const browser = await puppeteer.connect({ browserURL: 'http://localhost:9222', protocolTimeout: 60000 });
const pages = await browser.pages();
console.log('open tabs:', pages.length);
for (const p of pages) {
  const u = p.url();
  console.log('-', u.slice(0, 100));
  if (/tumblr|mastodon|misskey|bsky|threads|twitter|x\.com|chrome-extension|share|intent/.test(u)) {
    try { await p.close(); console.log('  closed'); } catch (e) { console.log('  close err:', e.message); }
  }
}
await browser.disconnect();
