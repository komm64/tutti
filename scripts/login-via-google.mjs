// Click "Continue with Google" on Tumblr login. Chrome should be signed into Google
// in this test profile, so this might just work.
import puppeteer from 'puppeteer-core';

const browser = await puppeteer.connect({
  browserURL: 'http://localhost:9222',
  defaultViewport: null,
});

const pages = await browser.pages();
const page = pages.find((p) => /tumblr\.com/.test(p.url())) ?? pages[0];

if (!page.url().includes('/login')) {
  console.log('既にログインしてるかも? URL:', page.url());
  await browser.disconnect();
  process.exit(0);
}

await page.bringToFront();

console.log('Continue with Google ボタンを探します...');

// Tumblr login page にある "Continue with Google" を探す
const found = await page.evaluate(() => {
  const buttons = Array.from(document.querySelectorAll('button, a, [role="button"]'));
  const candidates = buttons.filter((el) => /continue with google|google で続/i.test(el.textContent ?? ''));
  if (candidates.length === 0) return { ok: false, count: buttons.length };
  // クリック
  (candidates[0]).click();
  return { ok: true, text: candidates[0].textContent?.trim() };
});

console.log('result:', found);

// Google OAuth に遷移する。続けて様子見
console.log('5 秒待ち...');
await new Promise((r) => setTimeout(r, 5000));

console.log('現在の URL:', page.url());
console.log('現在の title:', await page.title());

await browser.disconnect();
