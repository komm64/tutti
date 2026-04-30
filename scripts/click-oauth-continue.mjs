import puppeteer from 'puppeteer-core';

const browser = await puppeteer.connect({
  browserURL: 'http://localhost:9222',
  defaultViewport: null,
});

let pages = await browser.pages();
let page = pages.find((p) => /accounts\.google\.com|tumblr\.com/.test(p.url())) ?? pages[0];

console.log('current URL:', page.url().slice(0, 100));

// "Continue" / "続行" / "Allow" 等を text で探す
async function clickByText(texts) {
  return await page.evaluate((texts) => {
    const buttons = Array.from(document.querySelectorAll('button, a, [role="button"]'));
    for (const t of texts) {
      const found = buttons.find((el) => (el.textContent ?? '').trim() === t);
      if (found) { (found).click(); return { ok: true, text: t }; }
    }
    return { ok: false };
  }, texts);
}

// 5 回くらい連続で押す(consent 多段かも)
for (let i = 0; i < 5; i++) {
  const r = await clickByText(['Continue', 'Allow', 'Accept', '続行', '許可', 'Next']);
  console.log(`step ${i + 1}:`, r, '→ URL:', page.url().slice(0, 80));
  if (!r.ok) break;
  await new Promise((r) => setTimeout(r, 3000));
  pages = await browser.pages();
  page = pages.find((p) => /accounts\.google\.com|tumblr\.com/.test(p.url())) ?? pages[0];
}

console.log('\nfinal URL:', page.url());
console.log('final title:', await page.title());

await browser.disconnect();
