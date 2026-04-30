// Wait for Tumblr login in the running test Chrome, then dump everything we need.
import puppeteer from 'puppeteer-core';

const browser = await puppeteer.connect({
  browserURL: 'http://localhost:9222',
  defaultViewport: null,
});

let pages = await browser.pages();
let page = pages[0];

// Make sure we're on tumblr login page (or dashboard if logged in)
if (!page.url().includes('tumblr.com')) {
  console.log('navigating to tumblr.com ...');
  try {
    await page.goto('https://www.tumblr.com/dashboard', { waitUntil: 'domcontentloaded', timeout: 30000 });
  } catch { /* may detach */ }
  pages = await browser.pages();
  page = pages.find((p) => p.url().includes('tumblr.com')) ?? pages[0];
}

// Bring the test Chrome window to foreground so user can interact
try { await page.bringToFront(); } catch {}

console.log('\n========================================');
console.log('  Tumblr ログイン待機中');
console.log('========================================');
console.log('test Chrome (port 9222) で tumblr にログインしてください');
console.log('  email: REDACTED@example.com');
console.log('  password: (テスト垢のパスワード)');
console.log('');
console.log('現在の URL:', page.url());
console.log('ログイン完了を 5 分間ポーリングします...');
console.log('');

const start = Date.now();
const TIMEOUT_MS = 5 * 60 * 1000;
let loggedIn = false;
while (Date.now() - start < TIMEOUT_MS) {
  // Re-fetch pages periodically since page might be replaced
  pages = await browser.pages();
  const tumblrPage = pages.find((p) => /tumblr\.com/.test(p.url()));
  if (tumblrPage) page = tumblrPage;
  const url = page.url();
  if (!url.includes('/login') && !url.includes('/register') && url.includes('tumblr.com')) {
    loggedIn = true;
    console.log(`✓ ログイン検出 → URL: ${url}`);
    break;
  }
  await new Promise((r) => setTimeout(r, 3000));
  process.stdout.write('.');
}

if (!loggedIn) {
  console.log('\n!!! 5 分待ったけどログインされなかった。終了します。');
  await browser.disconnect();
  process.exit(1);
}

// Logged in. Navigate to /dashboard explicitly and wait for SPA hydration.
console.log('\n/dashboard に明示的にナビゲートして hydration 待ち...');
try {
  await page.goto('https://www.tumblr.com/dashboard', { waitUntil: 'domcontentloaded', timeout: 30000 });
} catch (e) {
  console.log('goto error:', e.message);
}
await new Promise((r) => setTimeout(r, 12000));

console.log('current URL:', page.url());
console.log('current title:', await page.title());

// Comprehensive debug dump
const dump = await page.evaluate(async () => {
  const cap = (s, n = 3000) => (typeof s === 'string' ? s.slice(0, n) : null);
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
    cookies: document.cookie.split(';').map((c) => c.trim()).filter(Boolean),
    localStorage: dumpStorage(localStorage),
    sessionStorage: dumpStorage(sessionStorage),
    windowKeys: Object.getOwnPropertyNames(window).filter((k) =>
      /tumblr|user|blog|init|apollo|state|auth|config|csrf|store|bx|account/i.test(k),
    ),
    tumblr: cap(JSON.stringify(window.tumblr ?? null), 8000),
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

console.log('\n=== TUMBLR DEBUG DUMP ===');
console.log(JSON.stringify(dump, null, 2));

await browser.disconnect();
