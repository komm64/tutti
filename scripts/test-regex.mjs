import puppeteer from 'puppeteer-core';
const browser = await puppeteer.connect({ browserURL: 'http://localhost:9222' });
const pages = await browser.pages();
const page = pages.find((p) => /tumblr\.com/.test(p.url())) ?? pages[0];

const result = await page.evaluate(() => {
  const html = document.documentElement.outerHTML;
  const patterns = [
    { name: 'isLoggedIn,user,name', re: /"isLoggedIn"\s*:\s*true\s*,\s*"user"\s*:\s*\{\s*"name"\s*:\s*"([\w-]+)"/ },
    { name: 'user with name+email', re: /"user"\s*:\s*\{\s*"name"\s*:\s*"([\w-]+)"[^{}]*?"email"\s*:\s*"[^"]+"/ },
    { name: 'isLoggedIn near name', re: /"isLoggedIn"\s*:\s*true[^{}]{0,300}?"name"\s*:\s*"([\w-]+)"/ },
    { name: 'inline script search', re: null }, // for separate strategy
  ];
  const out = [];
  for (const p of patterns.slice(0, 3)) {
    const m = html.match(p.re);
    out.push({ name: p.name, match: m ? m[1] : null });
  }
  // Also: only inline <script> tags
  let scriptMatch = null;
  for (const s of document.querySelectorAll('script')) {
    const t = s.textContent ?? '';
    if (t.length < 100) continue;
    const m = t.match(/"isLoggedIn"\s*:\s*true[^{}]{0,300}?"name"\s*:\s*"([\w-]+)"/);
    if (m) { scriptMatch = m[1]; break; }
  }
  out.push({ name: 'inline-script: isLoggedIn near name', match: scriptMatch });
  return out;
});

console.log(JSON.stringify(result, null, 2));
await browser.disconnect();
