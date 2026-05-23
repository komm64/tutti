import puppeteer from 'puppeteer-core';
const browser = await puppeteer.connect({ browserURL: 'http://localhost:9222', defaultViewport: null, protocolTimeout: 60000 });
const p = (await browser.pages()).find((page) => /instagram\.com/.test(page.url()) && !/static/.test(page.url()));
if (!p) { console.log('no IG tab'); process.exit(1); }
await p.bringToFront();
await new Promise((r) => setTimeout(r, 8000));
const snap = await p.evaluate(() => {
  // login wall indicators
  const loginForm = !!document.querySelector('form[action*="login"], input[name="username"]');
  const loginButton = Array.from(document.querySelectorAll('button')).some((b) => /log\s*in|ログイン/i.test(b.textContent ?? ''));
  // sidebar nav (logged-in indicator)
  const sidebar = !!document.querySelector('nav, [role="navigation"]');
  const allLinks = Array.from(document.querySelectorAll('a[href]')).slice(0, 40)
    .map((a) => ({
      href: a.getAttribute('href'),
      text: (a.textContent ?? '').trim().slice(0, 40),
      ariaLabel: a.getAttribute('aria-label'),
    })).filter((l) => l.href);
  // og meta
  const ogUrl = document.querySelector('meta[property="og:url"]')?.getAttribute('content');
  const ogTitle = document.querySelector('meta[property="og:title"]')?.getAttribute('content');
  // localStorage user info
  let lsKeys = [];
  try { lsKeys = Object.keys(localStorage).slice(0, 30); } catch { /* ignore */ }
  // any img with profile-like alt
  const profileImgs = Array.from(document.querySelectorAll('img[alt]'))
    .filter((i) => /profile/i.test(i.getAttribute('alt') ?? ''))
    .slice(0, 5)
    .map((i) => ({ alt: i.getAttribute('alt'), src: (i.getAttribute('src') ?? '').slice(0, 80) }));
  // svg aria-labels (IG uses lots of svg icons)
  const svgLabels = Array.from(document.querySelectorAll('svg[aria-label]'))
    .map((s) => s.getAttribute('aria-label'))
    .slice(0, 30);
  return {
    url: location.href,
    title: document.title,
    loginForm,
    loginButton,
    sidebar,
    ogUrl, ogTitle,
    lsKeys,
    profileImgs,
    svgLabels,
    allLinks: allLinks.slice(0, 25),
  };
});
console.log(JSON.stringify(snap, null, 2));
browser.disconnect();
