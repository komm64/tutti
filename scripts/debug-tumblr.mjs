// 既に動いている Chrome (debug port 9222) に接続して
// www.tumblr.com/dashboard を開き、Tutti が必要としているデータを総取りする。
//   node scripts/debug-tumblr.mjs
import puppeteer from 'puppeteer-core';

const browser = await puppeteer.connect({
  browserURL: 'http://localhost:9222',
  defaultViewport: null,
});

console.log('connected to', browser.version ? await browser.version() : '(unknown)');

// 既存タブで tumblr が開いてるか確認、なければ新タブ
const pages = await browser.pages();
let page = pages.find((p) => p.url().includes('tumblr.com'));
if (!page) {
  page = await browser.newPage();
}

// Console を全部リレー
page.on('console', (msg) => {
  console.log(`[page console][${msg.type()}] ${msg.text()}`);
});
page.on('pageerror', (err) => console.log(`[page error] ${err.message}`));

console.log('navigating to tumblr.com/dashboard ...');
try {
  await page.goto('https://www.tumblr.com/dashboard', { waitUntil: 'domcontentloaded', timeout: 30000 });
} catch (e) {
  console.log('goto error (may continue):', e.message);
}

// SPA hydration を待つ
console.log('waiting 15s for SPA hydration + Tutti content script retries...');
await new Promise((r) => setTimeout(r, 15000));

console.log('current URL:', page.url());
console.log('current title:', await page.title());

// 包括的 debug dump
const dump = await page.evaluate(async () => {
  const cap = (s, n = 1500) => (typeof s === 'string' ? s.slice(0, n) : null);
  const dumpStorage = (st) => {
    const o = {};
    try {
      for (let i = 0; i < st.length; i++) {
        const k = st.key(i);
        if (k) o[k] = cap(st.getItem(k));
      }
    } catch {}
    return o;
  };
  let dbList = [];
  try {
    if ('databases' in indexedDB) {
      const dbs = await indexedDB.databases();
      dbList = dbs.map((d) => d.name).filter(Boolean);
    }
  } catch {}
  return {
    location: { href: location.href, pathname: location.pathname },
    title: document.title,
    readyState: document.readyState,
    cookies: document.cookie.split(';').map((c) => c.trim()).filter(Boolean),
    localStorage: dumpStorage(localStorage),
    sessionStorage: dumpStorage(sessionStorage),
    windowKeys: Object.getOwnPropertyNames(window).filter((k) =>
      /tumblr|user|blog|init|apollo|state|auth|config|csrf|store|bx|account/i.test(k),
    ),
    tumblr: cap(JSON.stringify(window.tumblr ?? null), 4000),
    apolloState: cap(JSON.stringify(window.__APOLLO_STATE__ ?? null), 4000),
    initialState: cap(JSON.stringify(window.__INITIAL_STATE__ ?? null), 4000),
    bxData: cap(JSON.stringify(window.__bx_userdata ?? null), 1500),
    indexedDB: dbList,
    profileLinks: Array.from(
      document.querySelectorAll('a[href*="/blog/view/"], a[href^="/@"], a[href^="/"]'),
    )
      .filter((a) => !a.closest('article, [role="article"]'))
      .slice(0, 40)
      .map((a) => ({
        href: a.getAttribute('href'),
        text: a.textContent?.trim()?.slice(0, 60),
        aria: a.getAttribute('aria-label'),
      })),
    avatarImgs: Array.from(document.querySelectorAll('img'))
      .filter((img) => /avatar/i.test(img.alt) || /avatar/i.test(img.src))
      .slice(0, 30)
      .map((img) => ({ alt: img.alt, src: cap(img.src, 250) })),
    headerHtml: cap(document.querySelector('header')?.outerHTML ?? '', 4000),
    navHtml: cap(document.querySelector('nav, [role="navigation"]')?.outerHTML ?? '', 4000),
  };
});

console.log('\n=== DUMP ===');
console.log(JSON.stringify(dump, null, 2));

await browser.disconnect();
