// Verify new detection strategy on live Tumblr.
import puppeteer from 'puppeteer-core';

const browser = await puppeteer.connect({ browserURL: 'http://localhost:9222' });
const pages = await browser.pages();
const page = pages.find((p) => /tumblr\.com/.test(p.url())) ?? pages[0];

const result = await page.evaluate(() => {
  const RESERVED = new Set([
    'dashboard', 'explore', 'search', 'inbox', 'messages', 'settings',
    'login', 'register', 'new', 'tagged', 'about', 'help', 'privacy',
    'terms', 'apps', 'developers', 'press', 'jobs', 'staff', 'reblog',
    'communities', 'live', 'tv', 'likes', 'following', 'avatar', 'profile',
    'user', 'account', 'menu', 'home', 'photo', 'image', 'icon', 'logo',
    'banner', 'header', 'footer', 'sidebar', 'main', 'me', 'myself',
    'thumbnail', 'preview', 'media', 'view',
  ]);
  const isLikelyUsername = (s) =>
    !!s && /^[\w-]{2,}$/.test(s) && !RESERVED.has(s.toLowerCase());

  const all = Array.from(document.querySelectorAll('a[href^="/blog/"]'));
  const matches = [];
  for (const a of all) {
    if (a.closest('article, [role="article"]')) continue;
    const href = a.getAttribute('href') ?? '';
    const m = href.match(/^\/blog\/(?:view\/)?([^/?#]+)/);
    if (isLikelyUsername(m?.[1])) {
      matches.push({ username: m[1], href, text: a.textContent?.trim()?.slice(0, 60) });
    }
  }
  return matches;
});

console.log('matches:');
console.log(JSON.stringify(result, null, 2));

await browser.disconnect();
