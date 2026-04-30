import puppeteer from 'puppeteer-core';

const browser = await puppeteer.connect({
  browserURL: 'http://localhost:9222',
  defaultViewport: null,
});

let pages = await browser.pages();
let page = pages.find((p) => /accounts\.google\.com|tumblr\.com/.test(p.url())) ?? pages[0];

console.log('current URL:', page.url());

// Click the Ren Fujimoto account row
const clicked = await page.evaluate(() => {
  // 候補: メアド or 名前を含む clickable 要素
  const all = Array.from(document.querySelectorAll('div[role="link"], li, a[role="button"], div[data-identifier]'));
  for (const el of all) {
    const t = el.textContent ?? '';
    if (t.includes('ren.fujimoto') || t.includes('Ren Fujimoto')) {
      (el).click();
      return { ok: true, text: t.slice(0, 100) };
    }
  }
  // Fallback: 1 件目の account row
  const fallback = document.querySelector('[data-email], li[role="link"]');
  if (fallback) { (fallback).click(); return { ok: true, fallback: true }; }
  return { ok: false };
});

console.log('clicked:', clicked);

// 遷移待ち
await new Promise((r) => setTimeout(r, 6000));

pages = await browser.pages();
page = pages.find((p) => /tumblr\.com/.test(p.url())) ?? pages[0];

console.log('after click URL:', page.url());
console.log('after click title:', await page.title());

await browser.disconnect();
