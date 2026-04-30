import puppeteer from 'puppeteer-core';
const browser = await puppeteer.connect({ browserURL: 'http://localhost:9222' });
const pages = await browser.pages();
const page = pages.find((p) => /tumblr\.com/.test(p.url())) ?? pages[0];

const result = await page.evaluate(async () => {
  try {
    const res = await fetch('/api/v2/user/info', { credentials: 'include' });
    const text = await res.text();
    return { status: res.status, body: text.slice(0, 2000) };
  } catch (e) {
    return { error: String(e) };
  }
});
console.log('API result:');
console.log(JSON.stringify(result, null, 2));

// API limits / auth が要るパスも試す
const result2 = await page.evaluate(async () => {
  try {
    const res = await fetch('/svc/account/get_user_data', { credentials: 'include' });
    const text = await res.text();
    return { status: res.status, body: text.slice(0, 2000) };
  } catch (e) {
    return { error: String(e) };
  }
});
console.log('\n/svc/account/get_user_data:');
console.log(JSON.stringify(result2, null, 2));

await browser.disconnect();
